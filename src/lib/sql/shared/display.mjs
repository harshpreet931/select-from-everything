// how one result cell is shown, everywhere: the runner's ResultGrid, the figure kit's
// ResultTable and sql-check's goldens all go through here so a value never looks
// different in two places. plain js (imported by scripts, rehype plugins and the client).
//
// values arrive as postgres text output (string) or null. nothing is reformatted:
// 1.50 stays 1.50, t stays t, timestamps keep postgres' own spelling. only layout
// decisions live here: alignment (numbers right, like psql), NULL vs '', newlines, length.

const NUM = new Set([
  "int2", "int4", "int8", "smallint", "integer", "int", "bigint",
  "numeric", "decimal", "float4", "float8", "real", "double precision", "float",
  "money", "oid", "xid", "xid8", "cid", "regclass", "smallserial", "serial", "bigserial", "serial2", "serial4", "serial8",
]);
const BOOL = new Set(["bool", "boolean"]);
const TEXT = new Set(["text", "varchar", "character varying", "char", "character", "bpchar", "name", "citext"]);
const JSON_T = new Set(["json", "jsonb", "jsonpath"]);
const TIME = new Set([
  "date", "time", "timetz", "timestamp", "timestamptz", "interval",
  "time without time zone", "time with time zone", "timestamp without time zone", "timestamp with time zone",
]);

/**
 * the display family of a postgres type name ("int4", "numeric(10,2)", "character varying(20)",
 * "timestamp(3) with time zone"). arrays ("int4[]", "_int4") are "other".
 * @param {string | null | undefined} type
 * @returns {"num" | "bool" | "text" | "json" | "time" | "other"}
 */
export function typeCategory(type) {
  if (!type) return "other";
  const t = String(type).trim().toLowerCase();
  if (t.endsWith("[]") || t.startsWith("_")) return "other";
  // drop typmods: numeric(10,2) → numeric, timestamp(3) with time zone → timestamp with time zone
  const base = t.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").replace(/^pg_catalog\./, "");
  if (NUM.has(base)) return "num";
  if (BOOL.has(base)) return "bool";
  if (TEXT.has(base)) return "text";
  if (JSON_T.has(base)) return "json";
  if (TIME.has(base)) return "time";
  return "other";
}

/**
 * one cell, ready to print.
 *   null       → { text: "null", isNull: true }   (draw faint italic)
 *   ""         → { text: "''", empty: true }      (draw faint)
 *   newlines   → shown as ↵ so a row stays one line
 *   maxChars   → cut at that many code points, with … at the end
 * @param {string | null} v
 * @param {string} type
 * @param {{ maxChars?: number }} [o]
 * @returns {{ text: string; isNull?: true; empty?: true; align: "left" | "right" }}
 */
export function displayCell(v, type, o = {}) {
  const align = typeCategory(type) === "num" ? "right" : "left";
  if (v === null || v === undefined) return { text: "null", isNull: true, align };
  const s = String(v);
  if (s === "") return { text: "''", empty: true, align: "left" };
  let text = s.replace(/\r\n|\r|\n/g, "↵");
  const max = o.maxChars;
  if (max && max > 0) {
    const cps = Array.from(text);
    if (cps.length > max) text = cps.slice(0, Math.max(1, max - 1)).join("") + "…";
  }
  return { text, align };
}
