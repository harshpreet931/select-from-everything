import type { Capture } from "@/lib/db/captured";
import { LeafGridView, type GridQuery } from "./LeafGridView";
import { oneLine, prov, records, topNode } from "./source";

// server side: the leaf level of a two-int-column btree (the btree probe of one step), and for
// each query a pair of steps: its rows (which entries match, as postgres says) and its
// EXPLAIN (ANALYZE, BUFFERS). leaves are put in key order by following the right-links.
//
//   <LeafGrid trace={trace} index="ab_a_b" at={0} queries={[{ label: "a = 3", rows: 2, plan: 3 }, ...]} />

type BtPage = { blk: number; level: number; type: string; prev?: number; next?: number; high?: string; items: { key: string }[] };

const pair = (k: string): [number, number] => {
  const m = /^\((-?\d+), (-?\d+)\)$/.exec(k);
  if (!m) throw new Error(`LeafGrid: can't read the key ${k}`);
  return [Number(m[1]), Number(m[2])];
};

export function LeafGrid({
  trace,
  index,
  at,
  queries,
  hops,
}: {
  trace: Capture;
  index: string;
  /** the step whose btree probe has the index */
  at: number;
  queries: { label: string; rows: number; plan: number }[];
  /** draw where each index search lands (skip scan) */
  hops?: boolean;
}) {
  const bt = (trace.steps[at] as unknown as { btree?: Record<string, { pages: BtPage[] }> }).btree?.[index];
  if (!bt) throw new Error(`LeafGrid: step ${at} has no btree(${index})`);
  const leaves = bt.pages.filter((p) => p.level === 0);
  const byBlk = new Map(leaves.map((p) => [p.blk, p]));
  const first = leaves.find((p) => !p.prev);
  const ordered: BtPage[] = [];
  for (let p = first; p; p = p.next ? byBlk.get(p.next) : undefined) ordered.push(p);
  if (ordered.length !== leaves.length) throw new Error("LeafGrid: the leaves don't form one chain");
  const pages = ordered.map((p, i) => ({ n: i + 1, blk: p.blk, keys: p.items.map((it) => pair(it.key)) }));
  const qs: GridQuery[] = queries.map((q) => {
    const top = topNode(trace, q.plan);
    const scan = (top["Plans"] as Record<string, unknown>[] | undefined)?.[0] ?? top;
    return {
      label: q.label,
      sql: oneLine(trace.steps[q.plan].sql),
      note: trace.steps[q.plan].note,
      matches: records(trace, q.rows).map((r) => [Number(r.a), Number(r.b)] as [number, number]),
      op: String(scan["Node Type"]),
      cond: String(scan["Index Cond"] ?? ""),
      searches: Number(scan["Index Searches"] ?? 0),
      pages: Number(top["Shared Hit Blocks"] ?? 0) + Number(top["Shared Read Blocks"] ?? 0),
    };
  });
  return <LeafGridView pages={pages} queries={qs} hops={hops} source={prov(trace)} />;
}
