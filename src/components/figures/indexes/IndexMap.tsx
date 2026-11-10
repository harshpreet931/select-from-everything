import type { Capture } from "@/lib/db/captured";
import { IndexMapView, type MapEntry, type MapRow } from "./IndexMapView";
import { prov, records } from "./source";

// server side: a one-leaf index (the btree probe at step `at`) and its table in ctid order (the
// result of step `rows`, with a ctid column). each index entry keeps its address or its posting
// list of addresses, exactly as bt_page_items gave them.
//
//   <IndexMap trace={trace} index="few_name" at={0} rows={1} show={["id", "name"]} />

type BtItem = { key: string; tid?: [number, number]; tids?: [number, number][] };

export function IndexMap({ trace, index, at, rows, show }: { trace: Capture; index: string; at: number; rows: number; show: string[] }) {
  const bt = (trace.steps[at] as unknown as { btree?: Record<string, { pages: { level: number; items: BtItem[] }[] }> }).btree?.[index];
  if (!bt) throw new Error(`IndexMap: step ${at} has no btree(${index})`);
  const leaves = bt.pages.filter((p) => p.level === 0);
  if (leaves.length !== 1) throw new Error(`IndexMap: ${index} has ${leaves.length} leaf pages; this figure draws one`);
  const entries: MapEntry[] = leaves[0].items.map((it) => ({
    key: it.key,
    tids: (it.tids ?? (it.tid ? [it.tid] : [])).map(([b, o]) => `(${b},${o})`),
  }));
  const table: MapRow[] = records(trace, rows).map((r) => ({ ctid: String(r.ctid), cells: show.map((c) => r[c]) }));
  return <IndexMapView entries={entries} rows={table} columns={show} index={index} source={prov(trace)} />;
}
