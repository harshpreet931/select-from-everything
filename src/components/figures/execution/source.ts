import type { Capture } from "@/lib/db/captured";

// shared helpers for this part's figures and mdx exports. pure, no react, no "use client":
// server components and `export const` lines in the chapters pick the slice a client figure
// needs, so a capture never ships to the browser twice.

/** what <Provenance trace={...} /> needs, and nothing else */
export const prov = (t: Capture) => ({ engine: { version: t.engine?.version, build: t.engine?.build }, scenario: t.scenario });

/** a step's sql, comment lines dropped, trimmed */
export const tidy = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .trim();

/** a step's sql on one line */
export const oneLine = (sql: string) => tidy(sql).replace(/\s+/g, " ");

function step(t: Capture, i: number) {
  const st = t.steps[i];
  if (!st) throw new Error(`no step ${i} in ${t.scenario}`);
  return st;
}

/** a step's result as objects keyed by column name */
export function records(t: Capture, i: number): Record<string, string | null>[] {
  const st = step(t, i);
  if (!st.result) throw new Error(`step ${i} in ${t.scenario} has no result`);
  const cols = st.result.columns.map((c) => c.name);
  return st.result.data.map((r) => Object.fromEntries(cols.map((c, j) => [c, r[j]])));
}

/** a step's result as a { columns, rows } table */
export function tableAt(t: Capture, i: number): { columns: { name: string; type: string }[]; rows: (string | null)[][] } {
  const st = step(t, i);
  if (!st.result) throw new Error(`step ${i} in ${t.scenario} has no result`);
  return { columns: st.result.columns, rows: st.result.data };
}

/** the single value of a one-row, one-column result (or row r, column c) */
export function valueAt(t: Capture, i: number, r = 0, c = 0): string {
  const v = step(t, i).result?.data?.[r]?.[c];
  if (v == null) throw new Error(`step ${i} in ${t.scenario} has no value at ${r},${c}`);
  return v;
}

/** text EXPLAIN (one "QUERY PLAN" row per line) as one string */
export function planText(t: Capture, i: number): string {
  const st = step(t, i);
  if (!st.result) throw new Error(`step ${i} in ${t.scenario} has no result`);
  return st.result.data.map((r) => r[0] ?? "").join("\n");
}

type J = Record<string, unknown>;

/** a step's EXPLAIN (FORMAT JSON) top node */
export function topNode(t: Capture, i: number): J {
  const e = step(t, i).explain as { Plan?: J } | { Plan?: J }[] | undefined;
  const p = Array.isArray(e) ? e[0]?.Plan : e?.Plan;
  if (!p) throw new Error(`step ${i} in ${t.scenario} has no plan`);
  return p;
}

/** every node of a step's plan, pre-order (root first) */
export function jsonNodes(t: Capture, i: number): J[] {
  const out: J[] = [];
  const walk = (n: J) => {
    out.push(n);
    for (const k of (n.Plans as J[] | undefined) ?? []) walk(k);
  };
  walk(topNode(t, i));
  return out;
}

/** a field from the first node (pre-order) of a step's json plan that has it, optionally of one node type */
export function planField(t: Capture, i: number, key: string, nodeType?: string): number | string {
  const n = jsonNodes(t, i).find((x) => x[key] != null && (!nodeType || x["Node Type"] === nodeType));
  if (!n) throw new Error(`step ${i} in ${t.scenario}: no plan node${nodeType ? ` of type ${nodeType}` : ""} has ${key}`);
  return n[key] as number | string;
}

/** the first match of `re` in a step's text plan, capture group 1 (or the whole match) */
export function fromText(t: Capture, i: number, re: RegExp): string {
  const m = re.exec(planText(t, i));
  if (!m) throw new Error(`step ${i} in ${t.scenario}: ${re} not in the plan`);
  return m[1] ?? m[0];
}

/** 12345 → "12,345" */
export const n = (v: number | string) => Number(v).toLocaleString("en-US");

/** the top node's page accesses in a step's text plan: shared hit + read on its first Buffers line */
export function topBuffers(t: Capture, i: number): number {
  const m = /Buffers: shared(?: hit=(\d+))?(?: read=(\d+))?/.exec(planText(t, i));
  if (!m) throw new Error(`step ${i} in ${t.scenario}: no Buffers line`);
  return Number(m[1] ?? 0) + Number(m[2] ?? 0);
}

/** a chapter's own golden file (content/<part>/<chapter>.golden.json), the parts these helpers read */
export type Golden = { blocks: Record<string, { sql: string; statements: { columns?: [string, string, number][]; rows?: (string | null)[][] }[] }> };

/**
 * statement `stmt` of the run block whose sql contains `match`, as { columns, rows }. for figures
 * that must show exactly what a run block on the same page prints (oids, say).
 */
export function goldenAt(g: Golden, match: string, stmt = 0): { columns: string[]; rows: (string | null)[][] } {
  const hits = Object.values(g.blocks).filter((b) => b.sql.includes(match));
  if (hits.length !== 1) throw new Error(`goldenAt: ${hits.length} blocks contain ${JSON.stringify(match)}`);
  const st = hits[0].statements[stmt];
  if (!st?.columns || !st.rows) throw new Error(`goldenAt: statement ${stmt} of that block has no rows`);
  return { columns: st.columns.map((c) => c[0]), rows: st.rows };
}
