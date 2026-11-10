// one-line descriptions of every view, for role="img" aria-labels. pure, and outside the
// "use client" primitives, so server components can call them too (a function imported from
// a client module is a client reference on the server, not the function).

import type { BTreeView, ChainView, HashView, HeapFileView, Page, PlanNode, PoolView, SnapView, WalView } from "./views";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { planNodes } from "./fromTrace.ts";
// @ts-ignore
import { snapText } from "./visibility.ts";

const n = (x: number) => x.toLocaleString("en-US");

export function describePage(p: Page): string {
  const tuples = p.tuples.filter((t) => t.lpFlags === "normal").length;
  const free = Math.max(0, p.upper - p.lower);
  return `page ${p.block} of ${p.rel}: ${p.tuples.length} line pointers, ${tuples} tuples, ${n(free)} bytes free between pd_lower ${p.lower} and pd_upper ${p.upper}`;
}

export const describeChain = (v: ChainView): string =>
  `${v.versions.filter((x) => x.lpFlags === "normal").length} versions of the row${v.rel ? ` in ${v.rel}` : ""}, linked by t_ctid`;

export function describeBTree(v: BTreeView): string {
  const nodes = Object.values(v.nodes);
  const height = (v.nodes[v.root]?.level ?? 0) + 1;
  const leaves = nodes.filter((x) => x.level === 0).length;
  return `a b-tree of height ${height} with ${leaves} leaf page${leaves === 1 ? "" : "s"}${v.path?.length ? `, search path ${v.path.length} pages long` : ""}`;
}

export function describePlan(p: PlanNode): string {
  const ns = planNodes(p);
  return `a query plan with ${ns.length} nodes: ${ns.map((x: PlanNode) => x.op).join(", ")}`;
}

export function describePool(v: PoolView): string {
  const used = v.frames.filter((f) => f.page).length;
  const dirty = v.frames.filter((f) => f.dirty).length;
  return `${v.frames.length} buffer frames, ${used} in use, ${dirty} dirty${v.hand >= 0 ? `, clock hand at frame ${v.hand}` : ""}`;
}

export function describeWal(v: WalView): string {
  const flushed = v.records.filter((r) => r.lsn < v.flush).length;
  return `${v.records.length} WAL records, ${flushed} flushed to disk${v.crashed ? ", after a crash" : ""}`;
}

export function describeHeapFile(v: HeapFileView): string {
  const size = v.size ?? 8192;
  const dead = v.pages.reduce((a, p) => a + p.dead, 0);
  const live = v.pages.reduce((a, p) => a + p.used, 0);
  return `${v.rel}: ${v.pages.length} pages of ${n(size)} bytes, ${n(live)} bytes of live tuples, ${n(dead)} bytes of dead tuples`;
}

export const describeSnapshot = (v: SnapView): string => `snapshot ${snapText(v.snap)}: xmin ${v.snap.xmin}, xmax ${v.snap.xmax}, ${v.snap.xip.length} running`;

export function describeHash(v: HashView): string {
  const tuples = v.buckets.reduce((a, b) => a + b.pages.reduce((s, p) => s + p.items.length, 0), 0);
  return `hash index with ${v.buckets.length} buckets and ${tuples} tuples, maxbucket ${v.meta.maxbucket}`;
}
