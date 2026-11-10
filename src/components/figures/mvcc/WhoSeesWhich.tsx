"use client";

import { useMemo, useState, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, NARR, Narration, Row, Words, useReducedMotion } from "@/components/figures/kit";
import { LaneTable } from "@/components/db/SessionLanes";
import { ChainDiagram } from "@/components/db/VersionChain";
import { chainFromPages, traceLanes } from "@/lib/db/fromTrace";
import type { PgStep, PgTrace } from "@/lib/db/pgtrace";
import type { ChainView, Snap, Tid } from "@/lib/db/views";
import { freshReader, snapText, visible, type Reader, type Verdict } from "@/lib/db/visibility";
import { engineText } from "./source";

// two sessions on the left, every version of one row on the right, one stepper for both.
// pick who is looking (each session's snapshot at that step, as the capture read it, or a
// transaction that starts right now) and every version says whether that reader sees it,
// and by which rule. versions nobody can see anymore (deleted by a committed xid older
// than every open snapshot) turn into dead ghosts, waiting for VACUUM.
//
//   <WhoSeesWhich trace={trace} rel="accounts" select="id=1" who="T2" field="balance" />
//
// field also narrows the version cards to that one column: the chain is already "id = 1",
// so the column that changes is the only one worth the room.

const NEW = "a new transaction";

/** the oldest xid any open snapshot or running transaction still needs at this step */
function horizonAt(st: PgStep): number {
  const xact = st.xact ?? {};
  const need: number[] = [];
  for (const x of Object.values(st.xids ?? {})) {
    if (x.snap) need.push(x.snap.xmin);
    if (x.xid) need.push(x.xid);
  }
  for (const [xid, s] of Object.entries(xact)) if (s === "in progress") need.push(Number(xid));
  return need.length ? Math.min(...need) : Math.max(0, ...Object.keys(xact).map(Number)) + 1;
}

function chainAt(trace: PgTrace, i: number, rel: string, select?: string): ChainView {
  const st = trace.steps[i];
  const bt = Object.values(st.btree ?? {})[0];
  const index = bt?.pages
    .filter((p) => p.level === 0)
    .flatMap((p) => p.items.map((it) => ({ key: it.key, tid: (it.tid ?? [0, 0]) as Tid, dead: it.dead })));
  return chainFromPages(st.heap?.[rel] ?? [], st.xact ?? {}, { rel, select, index, horizon: horizonAt(st) });
}

/** the rule, in words. an xid at or past the snapshot's xmax hadn't started yet, so say that */
function why(r: Verdict, t: { xmin?: number; xmax?: number }, snap: Snap, who: string): string {
  if (r.rule === 3 && t.xmin != null && t.xmin >= snap.xmax)
    return `xmin ${t.xmin} ≥ the snapshot's xmax ${snap.xmax}: that transaction hadn't started when ${who}'s snapshot was taken.`;
  if (r.rule === 7 && t.xmax != null && t.xmax >= snap.xmax)
    return `xmax ${t.xmax} ≥ the snapshot's xmax ${snap.xmax}: the transaction that replaced it hadn't started when ${who}'s snapshot was taken, so for ${who} nothing replaced it.`;
  return r.why;
}

export function WhoSeesWhich({
  trace,
  rel,
  select,
  who: who0,
  field,
  start = 0,
  interval = 2200,
}: {
  trace: PgTrace;
  rel: string;
  select?: string;
  /** who is looking at first: a session name, or "new" */
  who?: string;
  /** the column the narration reads out ("T2 would read balance 100.00"). default: the last one */
  field?: string;
  start?: number;
  interval?: number;
}) {
  const lanes = useMemo(() => traceLanes(trace, rel), [trace, rel]);
  const chains = useMemo(() => trace.steps.map((_, i) => chainAt(trace, i, rel, select)), [trace, rel, select]);
  const reduce = useReducedMotion();
  const s = useStepper(trace.steps.length, { interval, start });
  const names = [...trace.sessions, NEW];
  const [who, setWho] = useState(who0 === "new" ? NEW : (who0 ?? NEW));
  const st = trace.steps[s.i];
  const full = chains[s.i];
  // the cards show only `field` when it's given; the verdicts and narration use the full tuple
  const view = useMemo<ChainView>(
    () => (field ? { ...full, versions: full.versions.map((v) => (v.data && field in v.data ? { ...v, data: { [field]: v.data[field] } } : v)) } : full),
    [full, field],
  );

  // what changed since the previous step, by slot
  const hot = useMemo(() => {
    if (s.i === 0) return [];
    const sig = (v: ChainView) => new Map(v.versions.map((t) => [`${t.block},${t.lp}`, JSON.stringify(t)]));
    const a = sig(chains[s.i - 1]);
    return [...sig(full).entries()].filter(([k, v]) => a.get(k) !== v).map(([k]) => k);
  }, [chains, full, s.i]);

  const x = who === NEW ? null : st.xids?.[who];
  const reader: Reader | null = who === NEW ? freshReader(full.xact) : x?.snap ? { snap: x.snap, me: x.xid } : null;
  const versions = full.versions.filter((v) => v.lpFlags === "normal");
  const verdicts = reader ? versions.map((v) => ({ v, r: visible(v, full.xact, reader) })) : [];
  const seen = verdicts.filter((d) => d.r.visible);
  const label = who === NEW ? "a new transaction" : who;
  const data = seen.length === 1 ? seen[0].v.data : undefined;
  const col = field ?? (data ? Object.keys(data).at(-1) : undefined);

  let none: ReactNode = null;
  if (!reader)
    none = x?.inTxn ? (
      <>
        {who} is in a transaction but hasn&apos;t taken a snapshot yet: <code>BEGIN</code> doesn&apos;t take one, the first query does.
      </>
    ) : (
      <>{who} isn&apos;t in a transaction right now. its next statement gets a fresh snapshot, same as a new transaction.</>
    );

  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label={`${trace.title}, step by step`}>
      <Row k="as seen by =" w="13ch" last>
        <Words label="as seen by" options={names} value={who} onChange={setWho} />
        <span className="ml-1 text-[10px] text-meta">{reader ? `snapshot ${snapText(reader.snap)}` : "no snapshot"}</span>
      </Row>
      <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[760px]:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <div className="min-w-0">
          <LaneTable sessions={trace.sessions} steps={lanes} cur={s.i} dense />
        </div>
        <div className="grid min-w-0 content-start gap-3">
          {/* a div, not an h3: inside an article the prose heading styles would win */}
          <section className="min-w-0 rounded-md bg-well px-2 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]" aria-label="the row's versions">
            <div className="mb-2 font-mono text-11 text-faint">
              versions of {select ? select.replace("=", " = ") : "the row"} in {rel}
            </div>
            <ChainDiagram view={view} reader={reader ?? undefined} hot={hot} compact />
          </section>
          <ul className="grid gap-1" aria-live="polite">
            {reader ? (
              verdicts.map(({ v, r }) => (
                <li key={`${v.block},${v.lp}`} className={`${NARR} !text-[0.98rem]`}>
                  <span className="font-mono text-11 text-ref">
                    ({v.block},{v.lp})
                  </span>{" "}
                  <span style={{ color: r.visible ? "var(--live)" : "var(--mute)" }}>{r.visible ? "visible" : "invisible"}:</span> {why(r, v, reader.snap, label)}
                </li>
              ))
            ) : (
              <li className={`${NARR} !text-[0.98rem] text-mute`}>{none}</li>
            )}
          </ul>
        </div>
      </div>
      <Narration minLines={2}>
        {st.note}
        {reader && data && col && data[col] != null ? (
          <>
            {" "}
            <span className="text-mute">
              ({label} would read {col} <span className="font-mono text-[0.85em] text-live">{data[col]}</span>.)
            </span>
          </>
        ) : null}
      </Narration>
      <Legend
        items={[
          ["ref", "t_ctid link", "line"],
          ["live", "visible to this snapshot"],
          ["mute", "writer still in progress", "dashed"],
          ["dead", "dead to every snapshot", "ghost"],
          ["meta", "header fields"],
        ]}
      />
      <StepControls s={s} compact={reduce} />
      <div className="text-right text-[10px] leading-4 text-faint">{engineText(trace)}</div>
    </div>
  );
}
