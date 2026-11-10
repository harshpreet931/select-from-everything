import type { Capture } from "@/lib/db/captured";

// shared helpers for this part's figures. figures that only read a capture are server
// components: they pick the slice a client figure needs, so the whole trace never ships twice.

/** what <Provenance trace={...} /> needs, and nothing else */
export const prov = (t: Capture) => ({ engine: { version: t.engine?.version, build: t.engine?.build }, scenario: t.scenario });

/** a step's result as objects keyed by column name */
export function records(t: Capture, i: number): Record<string, string | null>[] {
  const st = t.steps[i];
  if (!st?.result) throw new Error(`step ${i} in ${t.scenario} has no result`);
  const cols = st.result.columns.map((c) => c.name);
  return st.result.data.map((r) => Object.fromEntries(cols.map((c, j) => [c, r[j]])));
}

/** the statement a step ran, on one line, comment lines dropped */
export const oneLine = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** the top plan node of a step's EXPLAIN (FORMAT JSON) */
export function topNode(t: Capture, i: number): Record<string, unknown> {
  const e = t.steps[i]?.explain as { Plan?: Record<string, unknown> } | undefined;
  if (!e?.Plan) throw new Error(`step ${i} in ${t.scenario} has no plan`);
  return e.Plan;
}

/** every node of a step's plan, depth first */
export function planNodesOf(t: Capture, i: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: Record<string, unknown>) => {
    out.push(n);
    for (const k of (n.Plans as Record<string, unknown>[] | undefined) ?? []) walk(k);
  };
  walk(topNode(t, i));
  return out;
}

/** a number from the first plan node that has it ("Index Searches", "Heap Fetches", ...) */
export function planValue(t: Capture, i: number, key: string): number {
  const n = planNodesOf(t, i).find((x) => x[key] != null);
  if (!n) throw new Error(`step ${i} in ${t.scenario}: no plan node has ${key}`);
  return Number(n[key]);
}

/** shared hit + read at the top of a step's plan: every page the query asked the buffer pool for */
export function pagesOf(t: Capture, i: number): number {
  const p = topNode(t, i);
  return Number(p["Shared Hit Blocks"] ?? 0) + Number(p["Shared Read Blocks"] ?? 0);
}
