"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Chip, Legend, NARR, Narration, Provenance, Row, Words, ring, statusLook, tid, tint, useReducedMotion } from "@/components/figures/kit";
import type { PgTrace } from "@/lib/db/pgtrace";
import type { ChainView, Source, Tuple, Viewer } from "@/lib/db/views";
import { HEAP_HOT_UPDATED, HEAP_ONLY_TUPLE, freshReader, removable, snapText, visible, type Reader } from "@/lib/db/visibility";
import { traceChain, traceLanes } from "@/lib/db/fromTrace";
import { StepSql, stepsOf, traceOf } from "./source";
import { XidChip } from "./PageView";
import { LaneTable } from "./SessionLanes";
import { describeChain } from "@/lib/db/describe";

// every version of a row, oldest first, linked by t_ctid (ref arrows). an UPDATE never
// changes a row in place: it writes a new version and stamps the old one's xmax. pick who
// is looking and each version says whether that snapshot sees it, and by which rule.
// outline = commit status of the inserting xid (solid committed, dashed in progress, dead
// aborted); live tint = visible to the chosen snapshot; dead ghost = removable by vacuum.
//
//   <VersionChain trace={trace} select="id=1" />                 "as seen by" = every session + a new transaction
//   <VersionChain trace={trace} select="accounts:id=1" lanes field="balance" who="T2" />   sessions beside the chain
//   <VersionChain steps={steps} snaps={{ T2: { xmin: 754, xmax: 756, xip: [754], me: 755 } }} />
// with a trace, versions deleted by a committed xid older than everything open at that step
// (horizonAt) are dead ghosts.

type V = Tuple & { block: number };


function Card({ v, view, reader, hot }: { v: V; view: ChainView; reader?: Reader; hot?: boolean }) {
  if (v.lpFlags === "redirect")
    return (
      <div className="flex min-h-[4.2rem] flex-col justify-center rounded-md px-2.5 py-1.5 text-11" style={{ boxShadow: ring("ref", 60), background: tint("ref", 6) }}>
        <span className="text-ref tabular">
          ({v.block},{v.lp})
        </span>
        <span className="text-faint">redirect</span>
        <span className="text-ref">→ lp {v.redirect}</span>
      </div>
    );
  const st = statusLook(v.xmin && v.xmin <= 2 ? "committed" : view.xact[v.xmin ?? 0]);
  const dead = removable(v, view.xact, view.horizon);
  const vis = reader ? visible(v, view.xact, reader) : null;
  const heapOnly = (v.infomask2 ?? 0) & HEAP_ONLY_TUPLE;
  const hotUpd = (v.infomask2 ?? 0) & HEAP_HOT_UPDATED;
  const data = Object.entries(v.data ?? {}).slice(0, 3);
  return (
    <div
      className="relative min-w-[8.5rem] rounded-md bg-well px-2.5 py-1.5 text-11 transition-[box-shadow,background-color,opacity] duration-200 ease-sfe @min-[520px]:text-12"
      style={{
        boxShadow: hot ? ring("hot", undefined, 1.5) : st.dashed || dead ? undefined : ring(st.tone === "ink" ? "line-2" : st.tone),
        outline: st.dashed || dead ? `1px dashed ${dead ? "var(--dead)" : "var(--mute)"}` : undefined,
        outlineOffset: -1,
        background: vis?.visible ? tint("live", 12) : undefined,
        opacity: dead ? 0.55 : 1,
      }}
      title={vis?.why}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-ref tabular">
          ({v.block},{v.lp})
        </span>
        <span className="flex gap-1">
          {heapOnly ? (
            <Chip tone="ink" title="heap-only tuple: no index entry points at it">
              H
            </Chip>
          ) : null}
          {dead ? (
            <Chip tone="dead" dashed>
              dead
            </Chip>
          ) : null}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
        <span className="text-meta">xmin</span>
        <span>
          <XidChip x={v.xmin} st={v.xmin ? view.xact[v.xmin] : undefined} />
        </span>
        <span className="text-meta">xmax</span>
        <span>
          <XidChip x={v.xmax} st={v.xmax ? view.xact[v.xmax] : undefined} />
        </span>
      </div>
      {data.length > 0 && (
        <div className="mt-1 border-t border-line pt-1">
          {data.map(([k, val]) => (
            <div key={k} className="truncate">
              <span className="text-mute">{k}</span> <span className={dead ? "text-mute line-through" : "text-hi"}>{val ?? "null"}</span>
            </div>
          ))}
        </div>
      )}
      {hotUpd ? <span className="sr-only">hot updated</span> : null}
    </div>
  );
}

/** the chain itself, no controls. compact = for side panels */
export function ChainDiagram({ view, reader, hot = [], compact }: { view: ChainView; reader?: Reader; hot?: string[]; compact?: boolean }) {
  const vs = view.versions;
  const key = (v: { block: number; lp: number }) => `${v.block},${v.lp}`;
  const next = (v: V) => (v.lpFlags === "redirect" ? `${v.block},${v.redirect}` : v.ctid ? `${v.ctid[0]},${v.ctid[1]}` : null);
  return (
    <div className="min-w-0" role="img" aria-label={describeChain(view)}>
      {view.index?.length ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-11">
          <span className="text-faint">index</span>
          {view.index.map((e, i) => (
            <Chip key={i} tone={e.dead ? "dead" : "ref"} dashed={e.dead}>
              {e.key} → {tid(e.tid)}
            </Chip>
          ))}
        </div>
      ) : null}
      <div className={`flex flex-wrap items-stretch gap-y-2 ${compact ? "gap-x-1" : "gap-x-1.5"}`}>
        {vs.map((v, i) => {
          const linked = i > 0 && next(vs[i - 1]) === key(v);
          const pointed = view.index?.some((e) => e.tid[0] === v.block && e.tid[1] === v.lp);
          return (
            <Fragment key={key(v)}>
              {i > 0 && (
                <span className="flex items-center px-0.5 text-12" style={{ color: linked ? "var(--ref)" : "var(--line-2)" }} aria-hidden title={linked ? "t_ctid" : undefined}>
                  {linked ? (vs[i - 1].lpFlags === "redirect" ? "⇢" : "→") : "·"}
                </span>
              )}
              <div className="flex flex-col">
                <span className="h-3.5 text-center text-[10px] leading-3 text-ref">{pointed ? "↓ index" : ""}</span>
                <Card v={v} view={view} reader={reader} hot={hot.includes(key(v))} />
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

const NEW = "a new transaction";

type ChainProps = Source<ChainView> & {
  /** fixed snapshots to look through (hand-written figures). with a trace, leave it out: each session's own snapshot at each step is used */
  snaps?: Record<string, Viewer>;
  rel?: string;
  /** who is looking first: a session name, a snaps key, or "new" */
  who?: string;
  /** narrow the version cards to this one column (the verdicts still use the whole tuple) */
  field?: string;
  /** with a trace: draw the sessions (SessionLanes) beside the chain, one stepper for both */
  lanes?: boolean;
  start?: number;
  interval?: number;
};

export function VersionChain(props: ChainProps) {
  const trace = traceOf(props);
  const relOf = (t: PgTrace, sel?: string) => {
    const [rel, filter] = sel?.includes(":") ? sel.split(":") : [props.rel ?? Object.keys(t.rels).find((r) => t.rels[r].kind === "table") ?? "", sel];
    return { rel, filter };
  };
  const steps = useMemo(
    () =>
      stepsOf(props, (t, i, sel) => {
        const { rel, filter } = relOf(t, sel);
        return traceChain(t, i, rel, filter);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ["view" in props ? props.view : null, "steps" in props ? props.steps : null, trace, "select" in props ? props.select : null, props.rel],
  );
  const lanes = useMemo(() => (trace && props.lanes ? traceLanes(trace, relOf(trace, "select" in props ? props.select : undefined).rel) : null), [trace, props.lanes]); // eslint-disable-line react-hooks/exhaustive-deps
  const reduce = useReducedMotion();
  const s = useStepper(Math.max(1, steps.length), { interval: props.interval ?? 1800, start: props.start ?? 0 });
  const i = Math.min(s.i, steps.length - 1);
  const cur = steps[i];
  const full = cur?.view;
  // who can look: stable for the whole figure. with a trace, every session plus a new
  // transaction; a session that has no snapshot at this step says so instead of a verdict
  const names = [...(props.snaps ? Object.keys(props.snaps) : (trace?.sessions ?? [])), NEW];
  const [who, setWho] = useState<string>(() => (props.who === "new" ? NEW : props.who && names.includes(props.who) ? props.who : names[0]));
  const view = useMemo<ChainView | undefined>(
    () => (full && props.field ? { ...full, versions: full.versions.map((v) => (v.data && props.field! in v.data ? { ...v, data: { [props.field!]: v.data[props.field!] } } : v)) } : full),
    [full, props.field],
  );
  // what changed since the previous step, by slot (hand-written steps can still pass hot)
  const hot = useMemo(() => {
    if (cur?.hot) return cur.hot;
    if (!trace || i === 0 || !full) return [];
    const sig = (v: ChainView) => new Map(v.versions.map((t) => [`${t.block},${t.lp}`, JSON.stringify(t)]));
    const a = sig(steps[i - 1].view);
    return [...sig(full).entries()].filter(([k, v]) => a.get(k) !== v).map(([k]) => k);
  }, [cur, trace, i, full, steps]);
  if (!full || !view) return null;

  const x = trace && who !== NEW && !props.snaps ? trace.steps[i]?.xids?.[who] : undefined;
  const fixed = props.snaps?.[who];
  const reader: Reader | null = who === NEW ? freshReader(full.xact) : fixed ? { snap: fixed, me: fixed.me } : x?.snap ? { snap: x.snap, me: x.xid } : null;
  const verdicts = reader ? full.versions.filter((v) => v.lpFlags === "normal").map((v) => ({ v, r: visible(v, full.xact, reader) })) : [];
  const seen = verdicts.filter((d) => d.r.visible);
  const label = who === NEW ? "a new transaction" : who;
  const none = x?.inTxn ? (
    <>
      {who} is in a transaction but hasn&apos;t taken a snapshot yet: <code>BEGIN</code> doesn&apos;t take one, the first query does.
    </>
  ) : (
    <>{who} isn&apos;t in a transaction right now. its next statement gets a fresh snapshot, same as a new transaction.</>
  );

  const chain = (
    <div className="grid min-w-0 content-start gap-3 grid-cols-[minmax(0,1fr)]">
      {!lanes && cur.label ? <StepSql label={cur.label} /> : null}
      <ChainDiagram view={view} reader={reader ?? undefined} hot={hot} compact={!!lanes} />
      <ul className="grid gap-1" aria-live="polite">
        {reader ? (
          verdicts.map(({ v, r }) => (
            <li key={`${v.block},${v.lp}`} className={`${NARR} !text-[0.98rem]`}>
              <span className="font-mono text-11 text-ref">
                ({v.block},{v.lp})
              </span>{" "}
              <span style={{ color: r.visible ? "var(--live)" : "var(--mute)" }}>{r.visible ? "visible" : "invisible"}:</span> {r.why}
            </li>
          ))
        ) : (
          <li className={`${NARR} !text-[0.98rem] text-mute`}>{none}</li>
        )}
      </ul>
    </div>
  );
  const data = seen.length === 1 ? seen[0].v.data : undefined;
  const cols = data ? (props.field && props.field in data ? [props.field] : Object.keys(data).slice(0, 3)) : [];

  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="version chain step-through">
      <Row k="as seen by =" w="13ch" last>
        <Words label="as seen by" options={names} value={names.includes(who) ? who : NEW} onChange={setWho} />
        <span className="ml-1 text-[10px] text-meta">{reader ? `snapshot ${snapText(reader.snap)}` : "no snapshot"}</span>
      </Row>
      {lanes && trace ? (
        <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[760px]:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
          <div className="min-w-0">
            <LaneTable sessions={trace.sessions} steps={lanes} cur={i} dense />
          </div>
          {chain}
        </div>
      ) : (
        chain
      )}
      <Narration minLines={2}>
        {cur.note as ReactNode}
        {reader && data && cols.length ? (
          <>
            {" "}
            <span className="text-mute">
              ({label} reads {cols.map((c) => `${c} ${data[c]}`).join(", ")}.)
            </span>
          </>
        ) : null}
      </Narration>
      <Legend
        items={[
          ["ref", "t_ctid link", "line"],
          ["live", "visible to this snapshot"],
          ["mute", "writer still in progress", "dashed"],
          ["dead", "aborted, or dead to every snapshot", "ghost"],
          ["meta", "header fields"],
        ]}
      />
      {steps.length > 1 && <StepControls s={s} compact={reduce} />}
      {trace ? <Provenance trace={trace} /> : null}
    </div>
  );
}
