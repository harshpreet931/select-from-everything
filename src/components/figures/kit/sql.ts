import type { CSSProperties } from "react";
import { darkTheme, lightTheme } from "@/mdx/themes.mjs";

// a small sql tokenizer for figures (client and server). same colours as the shiki code
// blocks: read from src/mdx/themes.mjs, emitted as --shiki-light / --shiki-dark so
// globals.css picks the right one per theme. handles -- and /* */ comments, 'it''s',
// E'..\'..', $$..$$ and $tag$..$tag$, "Quoted" identifiers, ::casts and $1 params.

export type SqlKind = "kw" | "fn" | "ty" | "lit" | "str" | "ident" | "qident" | "param" | "op" | "cmt" | "punc" | "fg";
export type SqlTok = { t: string; k: SqlKind; at: number };

const KW = new Set(
  (
    "ABORT ALL ALTER ANALYZE AND ANY ARRAY AS ASC BEGIN BETWEEN BY CASCADE CASE CAST CHECK CHECKPOINT CLUSTER COLLATE COLUMN COMMIT " +
    "CONCURRENTLY CONFLICT CONSTRAINT COPY CREATE CROSS CURRENT CURRENT_DATE CURRENT_TIMESTAMP CURRENT_USER CURSOR DATABASE DEALLOCATE DECLARE DEFAULT DEFERRABLE DEFERRED " +
    "DELETE DESC DISTINCT DO DROP EACH ELSE END ESCAPE EXCEPT EXCLUDE EXECUTE EXISTS EXPLAIN EXTENSION FALSE FETCH FILTER FIRST FOLLOWING FOR FOREIGN FROM FULL " +
    "FUNCTION GENERATED GRANT GROUP GROUPING HAVING IF ILIKE IMMEDIATE IN INCLUDE INDEX INHERIT INITIALLY INNER INSERT INTERSECT INTO IS ISNULL ISOLATION JOIN KEY LANGUAGE LAST " +
    "LATERAL LEFT LEVEL LIKE LIMIT LISTEN LOCAL LOCK MATERIALIZED MERGE MODE NATURAL NEXT NO NOT NOTHING NOTIFY NOTNULL NOWAIT NULL NULLS OF OFFSET ON ONLY OR ORDER OUTER " +
    "OVER OVERRIDING OWNER PARTITION PRECEDING PREPARE PRIMARY PROCEDURE RANGE READ RECURSIVE REFERENCES REFRESH REINDEX RELEASE RENAME REPEATABLE REPLACE RESTRICT RETURNING RETURNS " +
    "REVOKE RIGHT ROLLBACK ROW ROWS SAVEPOINT SCHEMA SELECT SEQUENCE SERIALIZABLE SESSION SET SHARE SHOW SIMILAR SKIP SOME START STATISTICS TABLE TABLESAMPLE TEMP TEMPORARY THEN TIES " +
    "TO TRANSACTION TRIGGER TRUE TRUNCATE UNBOUNDED UNCOMMITTED UNION UNIQUE UNLOGGED UPDATE USING VACUUM VALUES VERBOSE VIEW WHEN WHERE WINDOW WITH WITHIN WITHOUT WORK " +
    "ANALYSE BUFFERS COSTS FORMAT TIMING SUMMARY COMMITTED ACCESS EXCLUSIVE NOKEY DOMAIN TYPE ENUM RETURN SECURITY INVOKER DEFINER STABLE IMMUTABLE VOLATILE STRICT"
  ).split(" "),
);

// words that look like calls but are syntax
const NOT_FN = new Set(["IN", "EXISTS", "VALUES", "ANY", "ALL", "SOME", "ARRAY", "OVER", "FILTER", "WITHIN", "AS", "USING", "ON", "AND", "OR", "NOT", "INTO", "TABLE", "WITH", "FROM", "JOIN", "IF", "CHECK", "KEY", "REFERENCES", "INCLUDE", "PARTITION", "ROW", "EXPLAIN", "VACUUM", "ANALYZE", "SET", "WHERE", "SELECT", "RETURNS", "CAST", "UNIQUE", "PRIMARY", "INDEX", "LATERAL", "CONFLICT", "DO"]);

const TY = new Set(
  (
    "int int2 int4 int8 integer smallint bigint serial bigserial smallserial numeric decimal real float float4 float8 double precision money " +
    "text varchar char character bpchar varying name citext uuid bytea bool boolean date time timetz timestamp timestamptz interval zone " +
    "json jsonb jsonpath xml inet cidr macaddr point line box polygon circle tsvector tsquery oid regclass regtype xid xid8 tid pg_lsn bit varbit int4range int8range numrange tsrange tstzrange daterange record void trigger"
  ).split(" "),
);

const RE =
  /(--[^\n]*)|(\/\*[\s\S]*?(?:\*\/|$))|([eE]'(?:[^'\\]|\\.|'')*'?)|('(?:[^']|'')*'?)|(\$([A-Za-z_][\w]*)?\$[\s\S]*?(?:\$\6\$|$))|("(?:[^"]|"")*"?)|(\$\d+)|(\b\d+(?:\.\d*)?(?:[eE][+-]?\d+)?\b|\.\d+(?:[eE][+-]?\d+)?\b)|([A-Za-z_][\w$]*)|(\s+)|(::|<>|<=|>=|!=|\|\||->>|->|#>>|#>|@>|<@|&&|[-+*/%<>=~!@#^&|?])|([(),;.\[\]:{}])/g;

export function tokenizeSql(src: string): SqlTok[] {
  const out: SqlTok[] = [];
  RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let prevSig: SqlTok | null = null; // last non-space token
  while ((m = RE.exec(src))) {
    const [s, lc, bc, estr, str, dollar, , qid, param, num, word, ws, op] = m;
    const at = m.index;
    let k: SqlKind;
    if (lc || bc) k = "cmt";
    else if (estr || str || dollar) k = "str";
    else if (qid) k = "qident";
    else if (param) k = "param";
    else if (num) k = "lit";
    else if (word) {
      const up = word.toUpperCase();
      const afterCast = prevSig?.t === "::";
      const call = /^\s*\(/.test(src.slice(RE.lastIndex));
      if (afterCast) k = "ty";
      else if (up === "TRUE" || up === "FALSE" || up === "NULL") k = "lit";
      else if (call && !NOT_FN.has(up) && !TY.has(word.toLowerCase())) k = "fn";
      else if (KW.has(up)) k = "kw";
      else if (TY.has(word.toLowerCase()) && isTypePosition(prevSig)) k = "ty";
      else k = "ident";
    } else if (ws) k = "fg";
    else if (op) k = "op";
    else k = "punc";
    const tok = { t: s, k, at };
    out.push(tok);
    if (k !== "fg" && k !== "cmt") prevSig = tok;
  }
  return out;
}

// a type name right after a column name in DDL, or after AS in CAST(x AS int)
function isTypePosition(prev: SqlTok | null): boolean {
  if (!prev) return false;
  if (prev.k === "ident" || prev.k === "qident") return true;
  if (prev.k === "ty") return true; // double precision, character varying
  return prev.k === "kw" && /^(AS|VARYING|WITH|WITHOUT)$/i.test(prev.t);
}

/* ---- colours, from the shiki themes ----------------------------------------------- */

type ThemeRule = { scope?: string[]; settings: { foreground?: string; fontStyle?: string } };
type Theme = { colors: Record<string, string>; tokenColors: ThemeRule[] };

const SCOPE: Partial<Record<SqlKind, string>> = {
  kw: "keyword",
  ty: "entity.name.type",
  fn: "entity.name.function",
  lit: "constant.numeric",
  param: "constant.numeric",
  str: "string",
  cmt: "comment",
  punc: "punctuation",
  op: "keyword.operator",
};

const pick = (t: Theme, scope: string) => {
  // the last rule mentioning the scope wins, like in a textmate theme
  const r = [...t.tokenColors].reverse().find((x) => x.scope?.includes(scope));
  return { fg: r?.settings.foreground ?? t.colors["editor.foreground"], italic: r?.settings.fontStyle === "italic" };
};

const FG = { dark: (darkTheme as Theme).colors["editor.foreground"], light: (lightTheme as Theme).colors["editor.foreground"] };

const STYLES = new Map<SqlKind, CSSProperties>();
function styleFor(k: SqlKind): CSSProperties {
  const hit = STYLES.get(k);
  if (hit) return hit;
  const scope = SCOPE[k];
  let s: CSSProperties;
  if (!scope) s = { ["--shiki-dark" as string]: FG.dark, ["--shiki-light" as string]: FG.light } as CSSProperties;
  else {
    const d = pick(darkTheme as Theme, scope);
    const l = pick(lightTheme as Theme, scope);
    s = {
      ["--shiki-dark" as string]: d.fg,
      ["--shiki-light" as string]: l.fg,
      ...(l.italic ? { fontStyle: "italic" } : {}),
    } as CSSProperties;
  }
  STYLES.set(k, s);
  return s;
}

export const tokStyle = (k: SqlKind): CSSProperties => styleFor(k);

/* ---- clauses -------------------------------------------------------------------------- */

const CLAUSE_HEADS: [string, RegExp][] = [
  ["WITH", /^WITH$/],
  ["SELECT", /^SELECT$/],
  ["FROM", /^FROM$/],
  ["WHERE", /^WHERE$/],
  ["GROUP BY", /^GROUP$/],
  ["HAVING", /^HAVING$/],
  ["WINDOW", /^WINDOW$/],
  ["UNION", /^(UNION|INTERSECT|EXCEPT)$/],
  ["ORDER BY", /^ORDER$/],
  ["LIMIT", /^LIMIT$/],
  ["OFFSET", /^OFFSET$/],
  ["FETCH", /^FETCH$/],
];

/**
 * where each top-level clause of a query sits: { clause, from, to } as character offsets.
 * JOINs belong to FROM. nested parentheses (subqueries) are skipped.
 */
export function clauseRanges(src: string): { clause: string; from: number; to: number }[] {
  const toks = tokenizeSql(src);
  const out: { clause: string; from: number; to: number }[] = [];
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === "(") depth++;
    else if (t.t === ")") depth--;
    if (depth !== 0 || t.k !== "kw") continue;
    const up = t.t.toUpperCase();
    const head = CLAUSE_HEADS.find(([, re]) => re.test(up));
    if (!head) continue;
    // WITH is a clause only when it opens the query: not WITH TIES, WITH TIME ZONE, WITH ORDINALITY
    if (head[0] === "WITH" && out.length) continue;
    if (out.length) out[out.length - 1].to = t.at;
    out.push({ clause: head[0] === "UNION" ? up : head[0], from: t.at, to: src.length });
  }
  // trim trailing whitespace and semicolons off each range
  for (const r of out) {
    let e = r.to;
    while (e > r.from && /[\s;]/.test(src[e - 1])) e--;
    r.to = e;
  }
  return out;
}

/** where SELECT's DISTINCT sits: `DISTINCT`, or `DISTINCT ON (keys)` including the parentheses */
export function distinctRange(src: string): { from: number; to: number; on: boolean } | undefined {
  const toks = tokenizeSql(src).filter((t) => t.k !== "fg" && t.k !== "cmt");
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === "(") depth++;
    else if (t.t === ")") depth--;
    if (depth !== 0 || t.t.toUpperCase() !== "SELECT" || toks[i + 1]?.t.toUpperCase() !== "DISTINCT") continue;
    const d = toks[i + 1];
    if (toks[i + 2]?.t.toUpperCase() !== "ON" || toks[i + 3]?.t !== "(") return { from: d.at, to: d.at + d.t.length, on: false };
    let level = 0;
    for (let j = i + 3; j < toks.length; j++) {
      if (toks[j].t === "(") level++;
      else if (toks[j].t === ")" && --level === 0) return { from: d.at, to: toks[j].at + 1, on: true };
    }
    return { from: d.at, to: src.length, on: true };
  }
  return undefined;
}

/** the first DISTINCT ON key, when it's a plain column name ("dept" in DISTINCT ON (dept, x)) */
export function distinctOnKey(src: string): string | undefined {
  const r = distinctRange(src);
  if (!r?.on) return undefined;
  const inner = src.slice(r.from, r.to).replace(/^DISTINCT\s+ON\s*\(/i, "").replace(/\)$/, "");
  const first = inner.split(",")[0]?.trim().replace(/^"|"$/g, "");
  return first && /^[A-Za-z_][\w.]*$/.test(first) ? first.replace(/^.*\./, "") : undefined;
}
