// server-side helpers for part vii (no react, no "use client"): a captured step → a RunPick run,
// with row tones read from a column postgres computed (a verdict like `agrees` or `ok`), so the
// figure colours what postgres said, not what the page decided.
//
//   import { tonedRun } from "@/components/figures/design/runs";
//   export const runs = { "a → b": tonedRun(trace, 1, "agrees", { f: "dead" }) };

import { resultOf, type Capture } from "@/lib/db/captured";

type Tone = "live" | "dead" | "hot" | "ref" | "meta";

/** step i as a RunPick run; each row's tone looks up its value in `col` (t/f, or any text) */
export function tonedRun(trace: Capture, i: number, col: string, map: Record<string, Tone>, note?: string) {
  const r = resultOf(trace, i);
  const j = r.columns.findIndex((c) => c.name === col);
  if (j < 0) throw new Error(`tonedRun: no column ${col} in step ${i} of ${trace.scenario}`);
  return { ...r, ...(note ? { note } : {}), tones: r.rows.map((row) => map[String(row[j])] ?? null) };
}

/** a run made of several steps: the sql of each joined, the result (or error) of the last */
export function chainRun(trace: Capture, steps: number[], note?: string) {
  const last = resultOf(trace, steps[steps.length - 1]);
  const failed = steps.map((i) => resultOf(trace, i)).find((r) => r.error);
  const err = failed?.error;
  // when a step failed, its note is the story (the steps after it only show what didn't change)
  const told = note ?? failed?.note ?? last.note;
  return {
    ...last,
    sql: steps.map((i) => resultOf(trace, i).sql).join("\n"),
    ...(told ? { note: told } : {}),
    ...(err ? { error: err, columns: [], rows: [] } : {}),
  };
}

type Golden = { blocks: Record<string, { sql: string; statements: { columns?: [string, string, number][] | null; rows?: (string | null)[][] }[] }> };

/** the rows of statement `stmt` in the one golden block whose sql contains `match` (a chapter's own golden) */
export function goldenAt(g: unknown, match: string, stmt = 0): { columns: { name: string; type: string }[]; rows: (string | null)[][] } {
  const hits = Object.values((g as Golden).blocks).filter((b) => b.sql.includes(match));
  if (hits.length !== 1) throw new Error(`goldenAt: ${hits.length} blocks contain ${JSON.stringify(match)}`);
  const st = hits[0].statements[stmt];
  if (!st?.columns || !st.rows) throw new Error(`goldenAt: statement ${stmt} of that block has no rows`);
  return { columns: st.columns.map((c) => ({ name: c[0], type: c[1] })), rows: st.rows };
}
