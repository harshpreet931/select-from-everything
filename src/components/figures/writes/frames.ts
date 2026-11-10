// pure helpers for part v's figures (server side, no react): a pgtrace capture → the slim data a
// client figure needs. a "frame" is one statement and the table after it: the statement's sql,
// its command tag (or error), what it returned, and the table diffed against the frame before it.
// new rows are live, changed cells hot, rows that went away stay one frame as struck ghosts.
// nothing is computed that postgres didn't say: the tones only compare two captured results.
//
//   import trace from "./traces/insert.pgtrace.json";
//   import { framesOf } from "@/components/figures/writes/frames";
//   export const frames = framesOf(trace, [{ state: 1, label: "empty" }, { stmt: 2, state: 3, label: "one row" }], "id");
//   <TableSteps frames={frames} table="teas" trace={prov(trace)} />

type Col = { name: string; type: string; sys?: boolean };
const SYS = new Set(["ctid", "xmin", "xmax"]);
const withSys = (cols: Col[]): Col[] => cols.map((c) => (SYS.has(c.name) ? { ...c, sys: true } : c));
type Res = { command: string; rows: number | null; columns: Col[]; data: (string | null)[][] };
type Step = { sql: string; note?: string; result?: Res; error?: { sqlstate: string; message: string } };
export type Capture = { steps: Step[]; engine?: { version?: string; build?: string }; scenario?: string };
export type Tone = "live" | "hot" | "dead";

export type FrameCell = string | null | { v: string | null; tone?: Tone; ghost?: boolean };
export type Frame = {
  label: string;
  /** the statement, tidied (comment lines dropped) */
  sql?: string;
  /** psql's command tag: "INSERT 0 3", "UPDATE 2000", "DELETE 1" */
  tag?: string;
  error?: { sqlstate: string; message: string };
  /** what the statement itself returned (RETURNING), if anything */
  out?: { columns: Col[]; rows: (string | null)[][] };
  columns: Col[];
  rows: FrameCell[][];
  rowTones: (Tone | null)[];
  ghost: number[];
  note?: string;
  /** how many rows the table really has, when the state query shows a window of it */
  total?: string;
};

const tidy = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .trim();

/** psql's tag from a captured result: INSERT has the oid 0 in front of its count */
export function tagOf(r?: Res): string | undefined {
  if (!r) return undefined;
  if (r.command === "INSERT") return `INSERT 0 ${r.rows ?? 0}`;
  if (r.rows !== null && /^(UPDATE|DELETE|MERGE|SELECT|COPY|FETCH|MOVE)$/.test(r.command)) return `${r.command} ${r.rows}`;
  return r.command;
}

const cmp = (a: string | null, b: string | null) => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const x = Number(a);
  const y = Number(b);
  if (a.trim() !== "" && b.trim() !== "" && Number.isFinite(x) && Number.isFinite(y)) return x - y;
  return a < b ? -1 : 1;
};

export type FrameSpec = {
  label: string;
  /** the step whose sql (and tag, RETURNING output or error) the frame shows */
  stmt?: number;
  /** the step whose result is the table after it */
  state?: number;
  /** narration; defaults to the stmt step's note, then the state step's */
  note?: string;
  /** don't diff against the previous frame (a reset, or a different table) */
  fresh?: boolean;
  /** "of 2,000" style footer: the step with a one-value count of the whole table */
  total?: number;
};

/**
 * frames for <TableSteps>. `key` is the column that identifies a row across frames (its name).
 * a frame without `state` keeps the previous table, untinted.
 */
export function framesOf(trace: Capture, specs: FrameSpec[], key: string): Frame[] {
  const out: Frame[] = [];
  let prev: { columns: Col[]; data: (string | null)[][] } | null = null;
  for (const sp of specs) {
    const st = sp.stmt !== undefined ? trace.steps[sp.stmt] : undefined;
    const ss = sp.state !== undefined ? trace.steps[sp.state] : undefined;
    if (sp.stmt !== undefined && !st) throw new Error(`frames: no step ${sp.stmt} in ${trace.scenario}`);
    if (sp.state !== undefined && !ss?.result) throw new Error(`frames: step ${sp.state} in ${trace.scenario} has no result`);
    const cur: { columns: Col[]; data: (string | null)[][] } | null = ss?.result ? { columns: ss.result.columns, data: ss.result.data } : prev;
    const frame: Frame = {
      label: sp.label,
      columns: withSys(cur?.columns ?? []),
      rows: [],
      rowTones: [],
      ghost: [],
      ...(st ? { sql: tidy(st.sql) } : {}),
      ...(st?.error ? { error: { sqlstate: st.error.sqlstate, message: st.error.message } } : st?.result ? { tag: tagOf(st.result) } : {}),
      ...(st?.result?.columns.length && !/^SELECT$/.test(st.result.command) ? { out: { columns: st.result.columns, rows: st.result.data } } : {}),
    };
    const note = sp.note ?? st?.note ?? ss?.note;
    if (note) frame.note = note;
    if (sp.total !== undefined) {
      const v = trace.steps[sp.total]?.result?.data?.[0]?.[0];
      if (v == null) throw new Error(`frames: step ${sp.total} has no single value`);
      frame.total = v;
    }
    if (!cur) {
      out.push(frame);
      continue;
    }
    const k = cur.columns.findIndex((c) => c.name === key);
    if (k < 0) throw new Error(`frames: no column ${key} in step ${sp.state}`);
    const diff = ss?.result && prev && !sp.fresh && prev.columns.length === cur.columns.length;
    if (!diff) {
      frame.rows = cur.data.map((r) => [...r]);
      frame.rowTones = cur.data.map(() => null);
    } else {
      const before = new Map(prev!.data.map((r) => [r[k], r]));
      const now = new Set(cur.data.map((r) => r[k]));
      type R = { cells: FrameCell[]; tone: Tone | null; ghost: boolean; key: string | null };
      const rows: R[] = cur.data.map((r) => {
        const old = before.get(r[k]);
        if (!old) return { cells: [...r], tone: "live", ghost: false, key: r[k] };
        const cells: FrameCell[] = r.map((v, j) => (v !== old[j] ? { v, tone: "hot" as const } : v));
        return { cells, tone: null, ghost: false, key: r[k] };
      });
      for (const r of prev!.data) if (!now.has(r[k])) rows.push({ cells: [...r], tone: "dead", ghost: true, key: r[k] });
      // keep the state query's order; slot each ghost in where its key sorts
      const live = rows.filter((r) => !r.ghost);
      const ghosts = rows.filter((r) => r.ghost);
      const merged: R[] = [...live];
      for (const g of ghosts) {
        let at = merged.findIndex((r) => cmp(r.key, g.key) > 0);
        if (at < 0) at = merged.length;
        merged.splice(at, 0, g);
      }
      frame.rows = merged.map((r) => r.cells);
      frame.rowTones = merged.map((r) => r.tone);
      frame.ghost = merged.flatMap((r, i) => (r.ghost ? [i] : []));
    }
    out.push(frame);
    if (ss?.result) prev = cur;
  }
  return out;
}

/** step i's result as a ResultTable's props, with an optional tone per row from a column's value */
export function tableOf(trace: Capture, i: number, tones?: { col: string; map: Record<string, Tone> }) {
  const r = trace.steps[i]?.result;
  if (!r) throw new Error(`tableOf: step ${i} in ${trace.scenario} has no result`);
  const j = tones ? r.columns.findIndex((c) => c.name === tones.col) : -1;
  return {
    columns: r.columns.map((c) => ({ name: c.name, type: c.type })),
    rows: r.data,
    rowTones: j >= 0 ? r.data.map((row) => tones!.map[String(row[j])] ?? null) : undefined,
  };
}

/** the single value of a one-row, one-column result */
export function valueAt(trace: Capture, i: number): string {
  const v = trace.steps[i]?.result?.data?.[0]?.[0];
  if (v == null) throw new Error(`valueAt: step ${i} in ${trace.scenario} has no single value`);
  return v;
}

/** EXPLAIN text (one "QUERY PLAN" row per line) as one string, for <SqlPanel lang="plan"> */
export function planText(trace: Capture, i: number): string {
  const r = trace.steps[i]?.result;
  if (!r) throw new Error(`planText: step ${i} in ${trace.scenario} has no result`);
  return r.data.map((row) => row[0] ?? "").join("\n");
}

/** a step's sql, comment lines dropped */
export const sqlAt = (trace: Capture, i: number) => tidy(trace.steps[i]?.sql ?? "");

/**
 * a RunPick run made of several steps: the sql of `show` (joined), the result or error of the
 * last one (or of `from`), and a note. for "do this, then look" pairs captured as two steps.
 */
export function pickRun(trace: Capture, show: number[], o: { from?: number; note?: string; ignoreErrors?: boolean } = {}) {
  const last = trace.steps[o.from ?? show[show.length - 1]];
  if (!last) throw new Error(`pickRun: no step ${o.from ?? show[show.length - 1]} in ${trace.scenario}`);
  // ignoreErrors: an earlier step's error is the story (told in the note), the last step's result is the point
  const err = o.ignoreErrors ? last.error : (show.map((i) => trace.steps[i]?.error).find(Boolean) ?? last.error);
  const note = o.note ?? show.map((i) => trace.steps[i]?.note).filter(Boolean).pop();
  return {
    sql: show.map((i) => sqlAt(trace, i)).map((s) => (s.endsWith(";") ? s : `${s};`)).join("\n"),
    ...(note ? { note } : {}),
    columns: err ? [] : (last.result?.columns ?? []),
    rows: err ? [] : (last.result?.data ?? []),
    ...(err ? { error: { sqlstate: err.sqlstate, message: err.message } } : {}),
  };
}
