import type { Capture } from "@/lib/db/captured";
import { ScanPathView } from "./ScanPathView";
import { prov, records } from "./source";

// server side: the heap page of every matching row, in index order (a step that selects
// (ctid::text::point)[0] ordered by the indexed column), and the table's size in pages.
//
//   <ScanPath trace={trace} step={16} pagesStep={17} />

export function ScanPath({ trace, step, pagesStep }: { trace: Capture; step: number; pagesStep: number }) {
  const rows = records(trace, step);
  const pages = rows.map((r) => Number(r.page));
  const total = Number(records(trace, pagesStep)[0].pages);
  return <ScanPathView pages={pages} total={total} source={prov(trace)} />;
}
