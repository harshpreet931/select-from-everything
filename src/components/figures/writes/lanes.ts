// a native two-session capture → the slim SessionLanes run a figure needs (server side, no react).
// the ops, notes and, with `db`, the committed rows after each step (read from the heap probe by
// the shared traceLanes). snapshots and locks are dropped: the writes chapters only need who
// waited, who woke, and what ended up committed. only the steps and a provenance line ship.
//
//   import race from "./traces/upsert-race.pgtrace.json";
//   export const runs = { "ON CONFLICT": runOf(race, { ok: true, what: "lost delivery", text: "…" }) };
//   <SessionLanes sessions={["T1", "T2"]} options={[…]} runs={runs} side="db" />

import { traceLanes } from "@/lib/db/fromTrace";
import type { PgTrace } from "@/lib/db/pgtrace";
import type { SessionStep } from "@/lib/db/views";

type Verdict = { ok: boolean; text: string; what?: string };

const asTrace = (t: unknown) => t as PgTrace;

/** the capture's steps as lanes, observer steps left out */
export function lanesOf(t: unknown, o: { db?: boolean } = {}): SessionStep[] {
  const tr = asTrace(t);
  const all = traceLanes(tr);
  return tr.steps.flatMap((st, i) => {
    if (st.session === "obs") return [];
    const src = all[i];
    const out: SessionStep = { ops: src.ops, note: src.note };
    if (o.db && src.db) out.db = src.db;
    return [out];
  });
}

/** one SessionLanes run: the lanes, the provenance line (not the capture), a verdict for the last step */
export function runOf(t: unknown, verdict?: Verdict) {
  const tr = asTrace(t);
  return {
    steps: lanesOf(tr, { db: true }),
    // SessionLanes only reads engine and scenario off a run's trace, for its provenance line
    trace: { engine: { version: tr.engine?.version, build: (tr.engine as { build?: string })?.build }, scenario: tr.scenario } as unknown as PgTrace,
    ...(verdict ? { verdict } : {}),
  };
}
