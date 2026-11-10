import type { Capture } from "@/lib/db/captured";
import { SelectivityView, type SelPoint, type SelStats } from "./SelectivityView";
import { prov, records } from "./source";

// server side of the selectivity figure (traces/selectivity.scenario.sql). step 0 is pg_stats for
// events.user_id, unabridged; step 1 the planner's estimate and the real count for each predicate.
// this file redoes the planner's arithmetic (eqsel and scalarineqsel in selfuncs.c, as of 18) for
// every captured point, and refuses to render if a single estimate comes out different: the
// figure's working is then the planner's working, not a story about it.
//
//   <Selectivity trace={trace} />

const arr = (s: string | null) => (s ? s.replace(/[{}]/g, "").split(",").map(Number) : []);
// from src/include/utils/selfuncs.h (postgres 18)
const DEFAULT_EQ_SEL = 0.005;
const DEFAULT_INEQ_SEL = 1 / 3;

export function Selectivity({ trace }: { trace: Capture }) {
  const [s] = records(trace, 0);
  const mcv = arr(s.mcv);
  const freq = arr(s.freqs);
  const hist = arr(s.bounds);
  const nullFrac = Number(s.null_frac);
  const nDistinct = Number(s.n_distinct);
  const rows = Number(s.reltuples);
  const sumMcv = freq.reduce((a, b) => a + b, 0);
  const rest = 1 - sumMcv - nullFrac;
  const others = nDistinct - mcv.length;
  const eqSel = 1 / others;
  const clampRows = (x: number) => Math.max(1, Math.round(x));

  const points: SelPoint[] = records(trace, 1).map((r) => {
    const op = String(r.op);
    const v = Number(r.v);
    const est = Number(r.est);
    const actual = Number(r.actual);
    let p: SelPoint;
    if (op === "user_id =") {
      const i = mcv.indexOf(v);
      if (i >= 0) p = { op, v, est, actual, kind: "mcv", sel: freq[i], freq: freq[i], rank: i + 1 };
      else p = { op, v, est, actual, kind: "rest", sel: Math.min(rest / others, Math.min(...freq)) };
    } else if (op === "user_id <") {
      const below = mcv.map((m, i) => (m < v ? freq[i] : 0));
      const mcvSel = below.reduce((a, b) => a + b, 0);
      const nBelow = below.filter((x) => x > 0).length;
      let lo = 0;
      let hi = hist.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (hist[m] < v) lo = m + 1;
        else hi = m;
      }
      let frac: number;
      let bucket: SelPoint["bucket"];
      if (lo <= 0) frac = 0;
      else if (lo >= hist.length) frac = 1;
      else {
        const a = hist[lo - 1];
        const b = hist[lo];
        const bf = Math.min(1, Math.max(0, (v - a) / (b - a)));
        frac = (lo - 1 + bf) / (hist.length - 1);
        if (lo === 1) frac += eqSel * (1 - bf);
        frac -= eqSel; // "x < c" is "x <= c" minus one value's share
        bucket = { i: lo, a, b, bf };
      }
      const cut = 0.01 / (hist.length - 1);
      const clamped = Math.min(1 - cut, Math.max(cut, frac));
      p = { op, v, est, actual, kind: "hist", sel: mcvSel + clamped * rest, mcvSel, nBelow, frac: clamped, clamped: clamped !== frac, bucket };
    } else if (op === "user_id + 0 =") p = { op, v, est, actual, kind: "default-eq", sel: DEFAULT_EQ_SEL };
    else p = { op, v, est, actual, kind: "default-ineq", sel: DEFAULT_INEQ_SEL };
    const mine = clampRows(p.sel * rows);
    if (mine !== est) throw new Error(`Selectivity: ${op} ${v}: the arithmetic says ${mine} rows, the planner said ${est}`);
    return p;
  });

  const stats: SelStats = { mcv, freq, hist, rows, sumMcv, rest, nullFrac, nDistinct, others, eqSel };
  return <SelectivityView stats={stats} points={points} source={prov(trace)} />;
}
