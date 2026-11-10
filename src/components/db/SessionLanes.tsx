"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Chip, Narration, Provenance, ResultTable, Row, Verdict, Words, NARR, ring, tint, tv, useReducedMotion, type Ink } from "@/components/figures/kit";
import type { PgTrace } from "@/lib/db/pgtrace";
import type { LockReq, SessionOp, SessionStep, Snap, Table } from "@/lib/db/views";
import { traceLanes } from "@/lib/db/fromTrace";
import { snapText } from "@/lib/db/visibility";
import { ChainDiagram } from "./VersionChain";

// sessions over time. time flows down, one lane per session, one row per step. a blocked
// statement is a dashed chip ("waits for T1: ShareLock on transaction 754") and its lane
// stays dashed until it wakes. COMMIT is live, an error is dead with its SQLSTATE, future
// rows sit at 15%. the side panel shows what's committed (or the versions, or the locks)
// after the current step. sessions are never colour-coded: T1 and T2 look the same.
//
//   <SessionLanes sessions={["T1", "T2"]} steps={steps} side="db" />
//   <SessionLanes sessions={["T1", "T2"]} trace={trace} side="versions" />
//   <SessionLanes sessions={["T1", "T2"]} options={[{ key: "iso", label: "isolation", values: ["read committed", "repeatable read"] }]}
//                 runs={{ "read committed": { steps, verdict: { ok: false, text: "..." } }, ... }} />

type Op = Exclude<SessionOp, string>;
const asOp = (o: SessionOp): Op => (typeof o === "string" ? { sql: o } : o);
const isCommit = (sql: string) => /^\s*(COMMIT|END)\b/i.test(sql);

export type Run = { steps?: SessionStep[]; trace?: PgTrace; verdict?: { ok: boolean; text: string; what?: string } };
type Side = "db" | "versions" | "locks" | "none";

/** carry the last defined value of a field forward to every later step */
function carry<T>(steps: SessionStep[], f: (s: SessionStep) => T | undefined): (T | undefined)[] {
  let last: T | undefined;
  return steps.map((s) => (last = f(s) ?? last));
}

export function LaneTable({
  sessions,
  steps,
  cur,
  cells,
  dense,
  maxHeight,
}: {
  sessions: string[];
  steps: SessionStep[];
  cur: number;
  /** per-row value columns, read from step.db as a Record (carried forward) */
  cells?: string[];
  dense?: boolean;
  maxHeight?: number;
}) {
  const db = useMemo(() => carry(steps, (s) => (s.db && !("columns" in s.db) ? (s.db as Record<string, unknown>) : undefined)), [steps]);
  const snaps = useMemo(() => carry(steps, (s) => s.snaps), [steps]);
  // per session: which rows sit inside a wait (between the blocked statement and its wake-up)
  const waiting = useMemo(() => {
    return sessions.map((_, si) => {
      const w = new Set<number>();
      let open = -1;
      steps.forEach((s, i) => {
        const op = s.ops?.[si];
        const o = op ? asOp(op) : null;
        if (o?.woke && open >= 0) open = -1;
        if (open >= 0) w.add(i);
        if (o?.wait) open = i;
      });
      return w;
    });
  }, [steps, sessions]);
  const nums = useMemo(() => {
    let n = 0;
    return steps.map((s) => (s.ops?.some(Boolean) || s.obs ? ++n : 0));
  }, [steps]);
  const cols = `2.4ch repeat(${sessions.length}, minmax(0, 1fr))${cells?.length ? ` repeat(${cells.length}, minmax(5ch, auto))` : ""}`;
  const py = dense ? "py-1" : "py-1.5";
  const snapNow = snaps[cur] ?? {};

  return (
    <div className="min-w-0 overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
      <div className="grid min-w-[280px] text-11 @min-[520px]:text-12" style={{ gridTemplateColumns: cols }} role="table" aria-label="sessions over time, one column per session">
        <div role="row" className="contents">
          <span role="columnheader" aria-label="step" className="sticky top-0 z-[2] border-b border-line-2 bg-well" />
          {sessions.map((name) => {
            const sn = (snapNow as Record<string, Snap | null>)[name];
            return (
              <div role="columnheader" key={name} className="sticky top-0 z-[2] min-w-0 border-b border-line-2 bg-well px-1 pb-1.5 text-center" title={sn ? `${name}'s snapshot: ${snapText(sn)}` : undefined}>
                <div className="truncate text-hi">{name}</div>
                <div className="h-4 truncate text-[10px] leading-4" style={{ color: sn ? "var(--meta)" : "transparent" }}>
                  {sn ? `snapshot ${snapText(sn)}` : "·"}
                </div>
              </div>
            );
          })}
          {cells?.map((c, j) => (
            <div role="columnheader" key={c} className={`sticky top-0 z-[2] flex flex-col justify-end border-b border-line-2 bg-well px-2 pb-1.5 text-center ${j === 0 ? "border-l border-l-line" : ""}`}>
              <span className="text-mute">{c}</span>
            </div>
          ))}
        </div>

        {steps.map((s, i) => {
          const future = i > cur;
          const now = i === cur;
          const lanes = !s.obs || s.ops?.some(Boolean);
          const num = (
            <span
              role="cell"
              className={`flex items-start border-b border-line pt-2 pl-0.5 text-[10px] tabular transition-opacity duration-200 ${now ? "text-hot" : "text-faint"}`}
              style={{ opacity: future ? 0.15 : 1, boxShadow: now ? "inset 2px 0 0 var(--hot)" : undefined }}
            >
              <span className="pl-1">{s.label ?? (nums[i] || "·")}</span>
            </span>
          );
          return (
            <Fragment key={i}>
            {s.obs && (
              // the observer isn't a session with a lane: its statement runs across all of them
              <div role="row" className="contents" aria-hidden={future || undefined}>
                {num}
                <div
                  role="cell"
                  className={`flex min-w-0 justify-center border-b border-line px-1 ${py} transition-opacity duration-200`}
                  style={{ gridColumn: `span ${sessions.length}`, opacity: future ? 0.15 : 1, background: now ? tint("hot", 5) : undefined }}
                >
                  <OpChip op={asOp(s.obs)} now={now} who={s.obsWho ?? "obs"} />
                </div>
                {cells?.map((c) => <span role="cell" key={c} className="border-b border-line" style={{ opacity: future ? 0.15 : 1 }} />)}
              </div>
            )}
            {lanes && (
            <div role="row" className="contents" aria-hidden={future || undefined}>
              {s.obs ? <span role="cell" className="border-b border-line" /> : num}
              {sessions.map((_, si) => {
                const op = s.ops?.[si];
                const w = waiting[si].has(i);
                return (
                  <div
                    role="cell"
                    key={si}
                    className={`relative flex min-w-0 justify-center border-b border-line px-1 ${py} transition-opacity duration-200`}
                    style={{ opacity: future ? 0.15 : 1, background: now ? tint("hot", 5) : undefined }}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-1/2 w-px" style={{ background: w ? undefined : "var(--line-2)", borderLeft: w ? "1px dashed var(--mute)" : undefined }} />
                    {op ? (
                      <OpChip op={asOp(op)} now={now} />
                    ) : w ? (
                      <span className="relative z-[1] self-center bg-well px-1 text-[10px] text-mute italic">waiting</span>
                    ) : null}
                  </div>
                );
              })}
              {cells?.map((c, j) => {
                const v = db[i]?.[c];
                const pv = i > 0 ? db[i - 1]?.[c] : undefined;
                const changed = i > 0 && JSON.stringify(v) !== JSON.stringify(pv);
                const o = v !== null && typeof v === "object" ? (v as { v: unknown; k?: Ink }) : null;
                return (
                  <span
                    role="cell"
                    key={c}
                    className={`flex items-center justify-center border-b border-line px-2 tabular ${py} ${j === 0 ? "border-l border-l-line" : ""}`}
                    style={{ opacity: future ? 0.15 : 1, background: now ? tint("hot", 5) : undefined }}
                  >
                    <span key={now && changed ? `${i}-${String(o ? o.v : v)}` : "s"} className={now && changed ? "flash px-1" : "px-1"} style={{ color: o?.k ? tv(o.k) : changed && now ? "var(--hot)" : "var(--ink)" }}>
                      {v === undefined ? "" : String(o ? o.v : v)}
                    </span>
                  </span>
                );
              })}
            </div>
            )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function OpChip({ op, now, who }: { op: Op; now?: boolean; who?: string }) {
  const commit = isCommit(op.sql) && !op.error;
  const tone: Ink | undefined = op.error ? "dead" : commit ? "live" : (op.tone as Ink | undefined);
  const wait = !!op.wait;
  const semantic = tone && tone !== "mute";
  return (
    <span
      className="relative z-[1] block max-w-full min-w-0 rounded-xs bg-well px-1.5 py-[3px] text-left leading-[1.4] break-words transition-[box-shadow,background-color] duration-200 ease-sfe"
      style={{
        outline: wait ? `1px dashed var(--mute)` : undefined,
        outlineOffset: wait ? -1 : undefined,
        boxShadow: wait ? (now ? ring("hot") : undefined) : now ? ring("hot", undefined, 1.5) : semantic ? ring(tone, 60) : ring("line-2"),
        background: now ? `color-mix(in srgb, var(--hot) 8%, var(--well))` : semantic ? `color-mix(in srgb, ${tv(tone)} 9%, var(--well))` : undefined,
        color: wait ? "var(--mute)" : tone ? tv(tone) : now ? "var(--hi)" : "var(--ink)",
      }}
    >
      {who && <span className="mr-1.5 text-[10px] text-faint">{who}</span>}
      {op.woke && <span className="mr-1 text-[10px] text-mute">woke:</span>}
      <span className="font-mono">{op.sql}</span>
      {op.wait && <span className="mt-0.5 block text-[10px] text-mute italic">{typeof op.wait === "string" ? op.wait : "waits"}</span>}
      {op.error && (
        <span className="mt-0.5 block text-[10px] text-dead">
          ERROR {op.error.sqlstate}: {op.error.message}
        </span>
      )}
      {op.out !== undefined && !op.error && !op.wait && <span className="mt-0.5 block text-[10px] text-mute">→ {op.out}</span>}
    </span>
  );
}

function SidePanel({ side, steps, cur, title }: { side: Side; steps: SessionStep[]; cur: number; title?: ReactNode }) {
  const db = carry(steps, (s) => s.db)[cur];
  const versions = carry(steps, (s) => s.versions)[cur];
  const locks = carry(steps, (s) => s.locks)[cur];
  if (side === "db" && db) {
    if ("columns" in db) {
      const t = db as Table;
      return (
        <div className="grid gap-1.5">
          <div className="text-11 text-faint">{title ?? "committed in the database"}</div>
          <ResultTable columns={t.columns} rows={t.rows} dense footer="none" />
        </div>
      );
    }
    return (
      <div className="grid gap-1.5">
        <div className="text-11 text-faint">{title ?? "committed in the database"}</div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md bg-well px-3 py-2 text-12 shadow-[inset_0_0_0_1px_var(--line)]">
          {Object.entries(db).map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-mute">{k}</dt>
              <dd className="text-hi tabular">{String(v)}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    );
  }
  if (side === "versions" && versions) {
    return (
      <div className="grid gap-1.5">
        <div className="text-11 text-faint">{title ?? "versions on the page"}</div>
        <ChainDiagram view={versions} compact />
      </div>
    );
  }
  if (side === "locks" && locks) return <LockList locks={locks} title={title} />;
  return null;
}

export function LockList({ locks, title }: { locks: LockReq[]; title?: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-11 text-faint">{title ?? "lock manager"}</div>
      <ul className="grid gap-1 text-11">
        {locks.length === 0 && <li className="text-faint">no locks</li>}
        {locks.map((l, i) => (
          <li key={i} className="flex flex-wrap items-center gap-1.5">
            {/* as wide as the longest session name ("conn1"), so the modes line up and never collide */}
            <span className="shrink-0 text-hi" style={{ width: `${Math.max(3, ...locks.map((x) => String(x.txn ?? "").length))}ch` }}>
              {l.txn}
            </span>
            <Chip tone={l.granted ? "meta" : "mute"} dashed={!l.granted} title={l.granted ? "held" : "waiting"}>
              {l.mode}
            </Chip>
            <span className="text-mute">{l.obj}</span>
            {!l.granted && <span className="text-[10px] text-mute italic">waiting</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Lanes({
  sessions,
  run,
  side,
  cells,
  dense,
  interval,
  start,
  sideTitle,
  provenance,
}: {
  sessions: string[];
  run: Run;
  side: Side;
  cells?: string[];
  dense?: boolean;
  interval: number;
  start: number;
  sideTitle?: ReactNode;
  provenance?: ReactNode;
}) {
  const steps = useMemo(() => run.steps ?? (run.trace ? traceLanes(run.trace) : []), [run]);
  const reduce = useReducedMotion();
  const s = useStepper(Math.max(1, steps.length), { interval, start });
  let note: ReactNode = null;
  for (let j = s.i; j >= 0 && note == null; j--) note = steps[j]?.note ?? null;
  const showSide = side !== "none" && steps.some((x) => (side === "db" ? x.db && !cells?.length : side === "versions" ? x.versions : x.locks));
  return (
    <div {...s.keys} className="grid min-w-0 gap-4 outline-none grid-cols-[minmax(0,1fr)]" aria-label="session timeline step-through">
      <div className={`grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] ${showSide ? "@min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]" : ""}`}>
        <LaneTable sessions={sessions} steps={steps} cur={s.i} cells={cells} dense={dense} />
        {showSide && (
          <div className="min-w-0">
            <SidePanel side={side} steps={steps} cur={s.i} title={sideTitle} />
          </div>
        )}
      </div>
      {s.atEnd && run.verdict ? (
        <Verdict ok={run.verdict.ok} what={run.verdict.what}>
          {run.verdict.text}
        </Verdict>
      ) : (
        <Narration minLines={2}>{note}</Narration>
      )}
      <StepControls s={s} compact={reduce} />
      {provenance != null ? (
        typeof provenance === "string" ? (
          <div className="text-right text-[10px] leading-4 text-faint">{provenance}</div>
        ) : (
          provenance
        )
      ) : run.trace ? (
        <Provenance trace={run.trace} />
      ) : null}
    </div>
  );
}

export function SessionLanes({
  sessions,
  steps,
  trace,
  cells,
  side = "db",
  options,
  runs,
  dense,
  interval = 1600,
  start = 0,
  verdict,
  sideTitle,
  provenance,
}: {
  sessions: string[];
  steps?: SessionStep[];
  trace?: PgTrace;
  cells?: string[];
  side?: Side;
  options?: { key: string; label: string; values: (string | { v: string; label: string })[] }[];
  runs?: Record<string, Run>;
  dense?: boolean;
  interval?: number;
  start?: number;
  verdict?: Run["verdict"];
  /** the side panel's heading (default: "committed in the database", "versions on the page", "lock manager") */
  sideTitle?: ReactNode;
  /** the provenance line: a string, or an element like <Provenance trace={prov(trace)} />. default: the trace's, when given a full trace */
  provenance?: ReactNode;
}) {
  const [picked, setPicked] = useOptions(options);
  const key = options?.map((o) => picked[o.key]).join("|") ?? "";
  const run: Run = runs?.[key] ?? { steps, trace, verdict };
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      {options?.length ? (
        <div>
          {options.map((o, i) => (
            <Row key={o.key} k={`${o.label} =`} w={`${Math.max(9, o.label.length + 3)}ch`} last={i === options.length - 1}>
              <Words label={o.label} options={o.values.map((v) => (typeof v === "string" ? v : { v: v.v, label: v.label }))} value={picked[o.key]} onChange={(v) => setPicked(o.key, v)} />
            </Row>
          ))}
        </div>
      ) : null}
      {run.steps || run.trace ? (
        <Lanes key={key} sessions={sessions} run={run} side={side} cells={cells} dense={dense} interval={interval} start={start} sideTitle={sideTitle} provenance={provenance} />
      ) : (
        <p className={NARR}>no run for {key}.</p>
      )}
    </div>
  );
}

function useOptions(options?: { key: string; values: (string | { v: string })[] }[]) {
  const [picked, set] = useState<Record<string, string>>(() =>
    Object.fromEntries((options ?? []).map((o) => [o.key, typeof o.values[0] === "string" ? o.values[0] : o.values[0].v])),
  );
  return [picked, (k: string, v: string) => set((p) => ({ ...p, [k]: v }))] as const;
}
