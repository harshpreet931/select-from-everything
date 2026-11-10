import type { Capture } from "@/lib/db/captured";
import { ReadOrderView } from "./ReadOrderView";
import { prov } from "./source";

// server side: the heap page of every matching row, in index order (a captured
// `ORDER BY key, ctid`, which is how a b-tree keeps duplicates), and the table's page count.
// the client derives the three visiting orders from that one list: an index scan follows it,
// moving to another page whenever the next row is elsewhere; a bitmap scan sorts and dedups
// it first; a seq scan reads every page once.
//
//   <ReadOrder trace={trace} step={4} pages={335} counts={{ index: 450, bitmap: 283, seq: 335 }} />

export function ReadOrder({ trace, step, pages, buffers }: { trace: Capture; step: number; pages: number; buffers: { index: number; bitmap: number; seq: number } }) {
  const rows = trace.steps[step]?.result?.data;
  if (!rows?.length) throw new Error(`ReadOrder: step ${step} in ${trace.scenario} has no rows`);
  return <ReadOrderView order={rows.map((r) => Number(r[0]))} pages={pages} buffers={buffers} source={prov(trace)} />;
}
