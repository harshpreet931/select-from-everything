import type { Capture } from "@/lib/db/captured";

// shared helpers for this part's figures (copied from the indexes part, not imported, so the two
// parts can change independently). figures that only read a capture are server components: they
// pick the slice a client figure needs, so the whole trace never ships twice.

/** what <Provenance trace={...} /> needs, and nothing else */
export const prov = (t: Capture) => ({ engine: { version: t.engine?.version, build: t.engine?.build }, scenario: t.scenario });

/** a step's result as objects keyed by column name */
export function records(t: Capture, i: number): Record<string, string | null>[] {
  const st = t.steps[i];
  if (!st?.result) throw new Error(`step ${i} in ${t.scenario} has no result`);
  const cols = st.result.columns.map((c) => c.name);
  return st.result.data.map((r) => Object.fromEntries(cols.map((c, j) => [c, r[j]])));
}

/** the first step whose sql matches */
export function stepWhere(t: Capture, re: RegExp): number {
  const i = t.steps.findIndex((s) => re.test(s.sql));
  if (i < 0) throw new Error(`no step matching ${re} in ${t.scenario}`);
  return i;
}

/** the top plan node of a step's EXPLAIN (FORMAT JSON) */
export function topNode(t: Capture, i: number): Record<string, unknown> {
  const e = t.steps[i]?.explain as { Plan?: Record<string, unknown> } | undefined;
  if (!e?.Plan) throw new Error(`step ${i} in ${t.scenario} has no plan`);
  return e.Plan;
}

/** name → number, from a step that returned (name, setting) rows */
export function settingsOf(t: Capture, i: number): Record<string, number> {
  return Object.fromEntries(records(t, i).map((r) => [String(r.name), Number(r.setting)]));
}
