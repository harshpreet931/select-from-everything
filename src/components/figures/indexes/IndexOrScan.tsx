import type { Capture } from "@/lib/db/captured";
import { fromExplainJson } from "@/lib/db/fromTrace";
import { IndexOrScanView, type Point } from "./IndexOrScanView";
import { prov, records } from "./source";

// server side of the selectivity sweep (traces/selectivity.scenario.sql). every number is the
// capture's: the plans postgres picked (@explain steps), and the sweep step that forced each of
// the three scans at every point and kept its estimated cost and the pages it touched. the
// client gets one small record per point, never the trace.
//
//   <IndexOrScan trace={trace} rows={30000} />

const SCANS = ["Seq Scan", "Bitmap Heap Scan", "Index Scan"];

export function IndexOrScan({ trace, rows }: { trace: Capture; rows: number }) {
  // which @explain step answers (col, n, rpc): follow SET / RESET random_page_cost through the steps
  const plans = new Map<string, { plan: unknown; note?: string }>();
  let rpc = "4";
  trace.steps.forEach((st) => {
    const set = /SET\s+random_page_cost\s*=\s*([\d.]+)/i.exec(st.sql);
    if (set) rpc = set[1];
    if (/RESET\s+random_page_cost/i.test(st.sql)) rpc = "4";
    const m = /WHERE\s+(\w+)\s*<\s*(\d+)/i.exec(st.sql);
    if (st.explain && m) plans.set(`${m[1]}|${m[2]}|${rpc}`, { plan: st.explain, note: st.note });
  });
  const sweepAt = trace.steps.findIndex((s) => /sweep\(/.test(s.sql));
  const sweep = records(trace, sweepAt);
  const cols = [...new Set(sweep.map((r) => r.col!))];
  const ns = [...new Set(sweep.map((r) => Number(r.n)))].sort((a, b) => a - b);
  const rpcs = [...new Set(sweep.map((r) => String(Number(r.rpc))))];

  const data: Record<string, Point[]> = {};
  for (const col of cols)
    for (const r of rpcs) {
      data[`${col}|${r}`] = ns.map((n) => {
        const here = sweep.filter((x) => x.col === col && String(Number(x.rpc)) === r && Number(x.n) === n);
        const scans = SCANS.map((name) => {
          const x = here.find((y) => y.scan === name);
          if (!x) throw new Error(`IndexOrScan: no ${name} for ${col} < ${n} at random_page_cost ${r}`);
          return { scan: name, cost: Number(x.cost), pages: Number(x.pages), chosen: x.chosen === "t" };
        });
        const pick = scans.find((s) => s.chosen)?.scan;
        // the drawn plan: captured at this random_page_cost if it was, else the default's, which
        // has to be the same scan (the trace only re-captures the point whose plan changes)
        const own = plans.get(`${col}|${n}|${r}`);
        const base = plans.get(`${col}|${n}|4`);
        const got = own ?? base;
        if (!got) throw new Error(`IndexOrScan: no plan for ${col} < ${n}`);
        const plan = fromExplainJson(got.plan);
        if (plan.op !== pick) throw new Error(`IndexOrScan: ${col} < ${n} at ${r}: the sweep picked ${pick}, the drawn plan is ${plan.op}`);
        // a step's note describes the default setting, so it's only shown there (or where it was captured)
        return { n, pct: (n / rows) * 100, scans, plan, note: own?.note ?? (r === "4" ? base?.note : undefined) };
      });
    }
  return <IndexOrScanView data={data} cols={cols} rpcs={rpcs} source={prov(trace)} />;
}
