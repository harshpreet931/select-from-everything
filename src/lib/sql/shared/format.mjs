// turning statement results into text: psql's aligned format (for diffs and copy), and the
// canonical form that goldens are compared in. shared by ResultGrid, the figure kit and sql-check.
// cell layout (alignment, NULL vs '') lives in display.mjs.

import { displayCell, typeCategory } from "./display.mjs";
import { fnv64 } from "./hash.mjs";

export { displayCell, typeCategory };

/** an EXPLAIN result: one text column called QUERY PLAN */
export function isPlan(r) {
  return !!r.columns && r.columns.length === 1 && r.columns[0].name === "QUERY PLAN";
}

const width = (s) => [...s].length;
const pad = (s, w, right) => (right ? " ".repeat(Math.max(0, w - width(s))) + s : s + " ".repeat(Math.max(0, w - width(s))));
const center = (s, w) => {
  const left = Math.floor((w - width(s)) / 2);
  return " ".repeat(Math.max(0, left)) + s + " ".repeat(Math.max(0, w - width(s) - left));
};

/** the source line of a statement with psql's LINE n: prefix and a caret under the position */
function caretLines(sql, position) {
  if (!position) return [];
  const cps = [...sql];
  const before = cps.slice(0, position - 1).join("");
  const lineNo = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const line = sql.split("\n")[lineNo - 1] ?? "";
  const prefix = `LINE ${lineNo}: `;
  return [prefix + line, " ".repeat(prefix.length + width(before.slice(lineStart))) + "^"];
}

function errorLines(e, sql) {
  const out = [`${e.severity || "ERROR"}:  ${e.message}`];
  if (sql && e.position) out.push(...caretLines(sql, e.position));
  if (e.detail) out.push(`DETAIL:  ${e.detail}`);
  if (e.hint) out.push(`HINT:  ${e.hint}`);
  if (e.internalQuery) {
    out.push(`QUERY:  ${e.internalQuery}`);
  }
  if (e.where) out.push(`CONTEXT:  ${e.where}`);
  return out;
}

/**
 * one statement, the way psql prints it (aligned format, NULL as empty, "(n rows)").
 * @param {import("../types").StatementResult} r
 */
export function toPsql(r) {
  const out = [];
  for (const n of r.notices ?? []) out.push(`${n.severity}:  ${n.message}`);
  if (r.error) {
    out.push(...errorLines(r.error, r.sql));
    return out.join("\n");
  }
  if (r.copyOut !== undefined) {
    out.push(r.copyOut.replace(/\n$/, ""));
    out.push(r.tag);
    return out.join("\n");
  }
  if (!r.columns) {
    out.push(r.tag);
    return out.join("\n");
  }
  const cols = r.columns;
  const right = cols.map((c) => typeCategory(c.type) === "num");
  const cells = r.rows.map((row) => row.map((v) => (v === null ? "" : v)));
  // psql prints a multi-line value over several lines with + at the line ends; one line is enough here
  const flat = cells.map((row) => row.map((v) => v.replace(/\n/g, "↵")));
  const w = cols.map((c, i) => Math.max(width(c.name), ...flat.map((row) => width(row[i] ?? ""))));
  out.push(" " + cols.map((c, i) => center(c.name, w[i])).join(" | ").replace(/\s+$/, ""));
  out.push(cols.map((_, i) => "-".repeat(w[i] + 2)).join("+"));
  for (const row of flat) out.push((" " + row.map((v, i) => pad(v, w[i], right[i])).join(" | ")).replace(/\s+$/, ""));
  const n = r.rowCount ?? r.rows.length;
  if (r.truncated && r.rows.length < n) out.push(`… ${(n - r.rows.length).toLocaleString("en-US")} more`);
  out.push(`(${n} row${n === 1 ? "" : "s"})`);
  return out.join("\n");
}

/** every statement of a run, psql style, separated by blank lines */
export function viewToPsql(view) {
  return view.statements.map(toPsql).join("\n\n");
}

/* ---- canonical form ------------------------------------------------------------- */

/** @typedef {[RegExp, string][]} Mask */

const TIMING = /** @type {Mask} */ ([
  [/actual time=[\d.]+\.\.[\d.]+/g, "actual time=X..X"],
  [/\b(Planning|Execution) Time: [\d.]+ ms/g, "$1 Time: X ms"],
  [/\b(Planning|Execution|Trigger \S+):? time=[\d.]+/g, "$1 time=X"],
  [/\bMemory: \d+kB/g, "Memory: NkB"],
  [/\bMemory Usage: \d+kB/g, "Memory Usage: NkB"],
  [/\bPeak Memory Usage: \d+ ?kB/g, "Peak Memory Usage: N kB"],
  [/\bDisk: \d+kB/g, "Disk: NkB"],
  [/"(Actual (?:Startup|Total) Time|Planning Time|Execution Time|Time)": [\d.]+/g, '"$1": X'],
  [/"(Peak Memory Usage|Memory Usage|Sort Space Used)": \d+/g, '"$1": N'],
  [/\bI\/O Timings: [^\n]*/g, "I/O Timings: X"],
]);

const NATIVE = /** @type {Mask} */ ([
  ...TIMING,
  [/^\s*Buffers: [^\n]*$/gm, "Buffers: X"],
  [/^\s*JIT:[\s\S]*$/gm, "JIT: X"],
  [/\b\d+\/[0-9A-F]{1,8}\b/g, "LSN"],
  [/\(\d+,\d+\)/g, "(ctid)"],
]);

/** masks applied to values before comparing. timing: wall-clock numbers. native: + buffers, jit, lsns, ctids */
export const MASKS = { timing: TIMING, native: NATIVE, none: /** @type {Mask} */ ([]) };

const esc = (v) => (v === null ? "\\N" : v.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, "\\n"));
const applyMask = (s, mask) => mask.reduce((acc, [re, to]) => acc.replace(re, to), s);

/**
 * one statement in canonical form: the thing goldens compare (through digest()).
 * @param {import("../types").StatementResult} r
 * @param {{ unordered?: boolean; volatile?: boolean }} [flags]
 * @param {Mask} [mask]
 */
export function canonicalStatement(r, flags = {}, mask = TIMING) {
  const out = [];
  const m = (s) => applyMask(s, mask);
  if (r.error) {
    const e = r.error;
    let line = `#${r.i + 1} ERROR ${e.sqlstate} ${m(e.message)}`;
    if (e.position) line += ` @${e.position}`;
    if (e.detail) line += ` detail=${m(e.detail)}`;
    if (e.hint) line += ` hint=${m(e.hint)}`;
    if (e.where) line += ` where=${m(e.where).replace(/\n/g, "\\n")}`;
    if (e.internalQuery) line += ` query=${esc(e.internalQuery)}@${e.internalPosition ?? ""}`;
    out.push(line);
  } else {
    out.push(`#${r.i + 1} ${r.tag}`);
    if (r.columns) out.push("cols: " + r.columns.map((c) => `${c.name} ${c.type}`).join(" | "));
    if (flags.volatile) {
      if (r.columns) out.push(`rows: ${r.rowCount ?? r.rows.length}`);
    } else {
      let lines = r.rows.map((row) => row.map((v) => m(esc(v))).join(" | "));
      if (flags.unordered) lines = [...lines].sort();
      out.push(...lines);
      if (r.copyOut !== undefined) out.push("copy: " + m(esc(r.copyOut)));
    }
    if (r.truncated) out.push(`truncated: ${r.truncated.kept} of ${r.truncated.total ?? "?"}`);
  }
  for (const n of r.notices ?? []) out.push(`notice: ${n.severity} ${n.sqlstate} ${m(n.message)}${n.detail ? ` detail=${m(n.detail)}` : ""}`);
  return out.join("\n");
}

/**
 * a whole run in canonical form.
 * @param {import("../types").SqlRunView} view
 * @param {{ unordered?: boolean; volatile?: boolean }} [flags]
 * @param {Mask} [mask]
 */
export function canonical(view, flags = {}, mask = TIMING) {
  return [...view.statements.map((s) => canonicalStatement(s, flags, mask)), `txn: ${view.txn ?? "I"}`].join("\n");
}

/** short stable digest of a canonical string */
export function digest(s) {
  return fnv64(s);
}
