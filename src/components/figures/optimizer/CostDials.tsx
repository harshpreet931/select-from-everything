import type { Capture } from "@/lib/db/captured";
import { CostDialsView, type DialPoint } from "./CostDialsView";
import { prov, records, settingsOf, stepWhere } from "./source";

// server side of the cost dials (traces/cost-dials.scenario.sql). the sweep step forced each of
// the three scans for one query under every combination of random_page_cost, seq_page_cost and
// cpu_tuple_cost, and kept each estimated total and which scan the planner picked. the client
// gets one small record per combination.
//
// the two formulas the figure prints are checked here against every captured point, so a
// recapture that changes the arithmetic fails the page instead of showing a wrong sum.
//
//   <CostDials trace={trace} />

const SCANS = ["Seq Scan", "Bitmap Heap Scan", "Index Scan"] as const;

export function CostDials({ trace }: { trace: Capture }) {
  const cat = records(trace, stepWhere(trace, /FROM pg_class AS c/));
  const set = settingsOf(trace, stepWhere(trace, /FROM pg_settings/));
  const sweep = records(trace, stepWhere(trace, /dial\(/));
  const heap = cat.find((r) => r.relname === "orders")!;
  const idx = cat.find((r) => r.relname === "orders_customer_id")!;
  const pages = Number(heap.relpages);
  const tuples = Number(heap.reltuples);
  const rows = Number(sweep[0].est_rows);
  const leaf = Math.ceil((rows * Number(idx.relpages)) / Number(idx.reltuples));
  const opc = set.cpu_operator_cost;

  const key = (r: Record<string, string | null>) => `${Number(r.rpc)}|${Number(r.spc)}|${Number(r.ctc)}`;
  const points: Record<string, DialPoint> = {};
  for (const r of sweep) {
    const k = key(r);
    points[k] ??= { scans: [] };
    points[k].scans.push({ scan: String(r.scan), cost: Number(r.cost), chosen: r.chosen === "t" });
  }
  const at = (rpc: number, spc: number, ctc: number, scan: string) => points[`${rpc}|${spc}|${ctc}`].scans.find((s) => s.scan === scan)!.cost;
  // the index scan's constant part: descent + index entries, read off the default point
  const k0 = at(4, 1, 0.01, "Index Scan") - (leaf + pages) * 4 - rows * 0.01;
  const k = Math.round(k0 * 100) / 100;
  // the bitmap scan's: every heap page is fetched (the cache model caps 3,959 fetches at the table's
  // 83 pages), and a bitmap that covers the whole table is read in order, at seq_page_cost
  const b0 = at(4, 1, 0.01, "Bitmap Heap Scan") - leaf * 4 - pages * 1 - rows * 0.01;
  const b = Math.round(b0 * 100) / 100;
  for (const [p, v] of Object.entries(points)) {
    const [rpc, spc, ctc] = p.split("|").map(Number);
    v.scans.sort((a, b) => SCANS.indexOf(a.scan as (typeof SCANS)[number]) - SCANS.indexOf(b.scan as (typeof SCANS)[number]));
    const seq = pages * spc + tuples * ctc + tuples * opc;
    if (Math.abs(seq - at(rpc, spc, ctc, "Seq Scan")) > 0.006) throw new Error(`CostDials: seq formula ${seq} vs ${at(rpc, spc, ctc, "Seq Scan")} at ${p}`);
    const ix = (leaf + pages) * rpc + rows * ctc + k0;
    if (Math.abs(ix - at(rpc, spc, ctc, "Index Scan")) > 0.011) throw new Error(`CostDials: index formula ${ix} vs ${at(rpc, spc, ctc, "Index Scan")} at ${p}`);
    const bm = leaf * rpc + pages * spc + rows * ctc + b0;
    if (Math.abs(bm - at(rpc, spc, ctc, "Bitmap Heap Scan")) > 0.011) throw new Error(`CostDials: bitmap formula ${bm} vs ${at(rpc, spc, ctc, "Bitmap Heap Scan")} at ${p}`);
  }
  const vals = (c: string) => [...new Set(sweep.map((r) => Number(r[c])))].sort((a, b) => a - b);
  return (
    <CostDialsView
      points={points}
      rpcs={vals("rpc")}
      spcs={vals("spc")}
      ctcs={vals("ctc")}
      f={{ pages, tuples, opc, leaf, rows, k, b }}
      source={prov(trace)}
    />
  );
}
