import type { PgTrace } from "@/lib/db/pgtrace";
import { horizonAt, traceLanes } from "@/lib/db/fromTrace";
import { removable } from "@/lib/db/visibility";
import { LongTxnView, type HorizonMoment } from "./LongTxnView";
import { engineText } from "./source";

// server side: a capture with an open snapshot and some deletes. per step, every heap page is
// split three ways: live tuples, tuples deleted by a committed transaction that something open
// can still see (dead, not yet removable), and tuples nothing can see anymore (removable).
// the horizon is horizonAt(): the oldest snapshot xmin or xid any session still holds. the
// VACUUM log lines for the table come along for the steps that have them.
//
//   <LongTxn trace={longTxn} rel="t" />

const al = (x: number) => Math.ceil(x / 8) * 8;

export function LongTxn({ trace, rel }: { trace: PgTrace; rel: string }) {
  const lanes = traceLanes(trace, rel);
  const moments: HorizonMoment[] = trace.steps.map((st) => {
    const xact = st.xact ?? {};
    const horizon = horizonAt(st);
    const pages = (st.heap?.[rel] ?? []).map((p) => {
      let live = 0;
      let held = 0;
      let gone = 0;
      for (const t of p.tuples) {
        if (t.lpFlags !== "normal" || !t.len) continue;
        const deleted = !!t.xmax && xact[t.xmax] === "committed" && !(t.flags ?? []).includes("HEAP_XMAX_LOCK_ONLY");
        if (removable(t, xact, horizon)) gone += al(t.len);
        else if (deleted) held += al(t.len);
        else live += al(t.len);
      }
      return { block: p.block, live, held, gone, free: Math.max(0, p.upper - p.lower) };
    });
    // the lines VACUUM VERBOSE wrote about this table (not its toast table)
    const log = st.log ?? [];
    const start = log.findIndex((l) => l.includes(`finished vacuuming`) && l.includes(`public.${rel}"`));
    const lines = start < 0 ? [] : log.slice(start + 1, start + 5).map((l) => l.trim()).filter((l) => /^(tuples|removable cutoff)/.test(l));
    return { horizon, pages, log: lines };
  });
  return <LongTxnView sessions={trace.sessions} lanes={lanes} moments={moments} size={trace.engine.blockSize} source={engineText(trace)} />;
}
