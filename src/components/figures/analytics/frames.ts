// server-side readers for this part's captures (no react, no "use client"): they turn pgtrace
// steps into the small slices the client figures draw, so a page never ships a whole capture.
//
//   import trace from "./traces/window-frames.pgtrace.json";
//   import { frameLab } from "@/components/figures/analytics/frames";
//   export const lab = frameLab(trace, ["ROWS | a", "RANGE | a"], 1, { key: "id", frame: "frame", show: ["id", "name"], out: ["sum"] });
//
// a frame step is one query over the same rows in the same order. its `key` column names each
// row, and its `frame` column is postgres's own list of the rows that fed the window function:
// array_agg(key) OVER w for a frame, or lag(key) OVER w for the single row a LAG read. nothing
// about which rows are in a frame is worked out here; it is all read off the capture.

import { resultOf, type Capture } from "@/lib/db/captured";

type Col = { name: string; type: string };

export type FrameRun = {
  sql: string;
  note?: string;
  /** per row: indices (into rows) of the rows that fed it, in the order postgres listed them */
  src: number[][];
  /** per row: the frame before EXCLUDE, as [first, last] indices (drawn as the bracket) */
  span?: ([number, number] | null)[];
  /** per row: the values of the out columns */
  out: (string | null)[][];
};

export type FrameLabData = {
  columns: Col[];
  rows: (string | null)[][];
  outCols: Col[];
  runs: Record<string, FrameRun>;
};

/** "{41,44,48}" or "{2026-04-12,2026-04-13}" → ["41", "44", "48"]. plain values only (no quoting). */
function parseArray(v: string | null): string[] {
  if (v === null) return [];
  const s = v.trim();
  if (!s.startsWith("{")) return [s];
  const body = s.slice(1, -1).trim();
  if (!body) return [];
  if (body.includes('"')) throw new Error(`frameLab: quoted array elements aren't supported: ${v}`);
  return body.split(",").map((x) => x.trim());
}

export function frameLab(
  trace: Capture,
  keys: string[],
  from: number,
  o: {
    /** the column that names a row (and whose values the frame column lists) */
    key: string;
    /** the column holding array_agg(key) OVER w, or lag(key) OVER w */
    frame: string;
    /** columns to draw, in order */
    show: string[];
    /** window-function columns to draw after them */
    out: string[];
    /** run key → the run key whose frame is this one before EXCLUDE (for the bracket) */
    base?: Record<string, string>;
  },
): FrameLabData {
  const first = resultOf(trace, from);
  const idx = (cols: Col[], n: string) => {
    const j = cols.findIndex((c) => c.name === n);
    if (j < 0) throw new Error(`frameLab: no column ${n} in step ${from} of ${trace.scenario}`);
    return j;
  };
  const kj = idx(first.columns, o.key);
  const order = first.rows.map((r) => r[kj]);
  const at = new Map(order.map((k, i) => [k, i]));
  const runs: Record<string, FrameRun> = {};
  keys.forEach((k, n) => {
    const r = resultOf(trace, from + n);
    if (r.error) throw new Error(`frameLab: step ${from + n} failed: ${r.error.message}`);
    const rk = idx(r.columns, o.key);
    const fj = idx(r.columns, o.frame);
    if (r.rows.map((x) => x[rk]).join("\u0001") !== order.join("\u0001")) throw new Error(`frameLab: step ${from + n} lists the rows in a different order`);
    const src = r.rows.map((row) =>
      parseArray(row[fj]).map((x) => {
        const i = at.get(x);
        if (i === undefined) throw new Error(`frameLab: step ${from + n} names a row ${x} that isn't in the table`);
        return i;
      }),
    );
    const oj = o.out.map((c) => idx(r.columns, c));
    runs[k] = { sql: r.sql, ...(r.note ? { note: r.note } : {}), src, out: r.rows.map((row) => oj.map((j) => row[j])) };
  });
  // the bracket: the frame before EXCLUDE took rows out of it
  for (const [k, b] of Object.entries(o.base ?? {})) {
    const run = runs[k];
    const base = runs[b];
    if (!run || !base) throw new Error(`frameLab: base ${k} → ${b}: no such run`);
    run.span = base.src.map((s) => (s.length ? [Math.min(...s), Math.max(...s)] : null));
  }
  const sj = o.show.map((c) => idx(first.columns, c));
  return {
    columns: sj.map((j) => first.columns[j]),
    rows: first.rows.map((r) => sj.map((j) => r[j])),
    outCols: o.out.map((c) => first.columns[idx(first.columns, c)]),
    runs,
  };
}

/** steps from..from+keys.length-1 as plain query texts with notes, keyed (for a plan side by side) */
export function textPlans(trace: Capture, keys: string[], from: number): Record<string, { sql: string; note?: string; plan: string }> {
  return Object.fromEntries(
    keys.map((k, n) => {
      const r = resultOf(trace, from + n);
      if (r.error) throw new Error(`textPlans: step ${from + n} failed: ${r.error.message}`);
      return [k, { sql: r.sql.replace(/^EXPLAIN\s*\([^)]*\)\s*/i, ""), ...(r.note ? { note: r.note } : {}), plan: r.rows.map((x) => x[0] ?? "").join("\n") }];
    }),
  );
}
