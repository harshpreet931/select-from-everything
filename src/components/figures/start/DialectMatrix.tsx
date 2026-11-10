"use client";

import { useState } from "react";
import { Narration, Well, ring, tint } from "@/components/figures/kit";
import { Source } from "./Source";

// one statement, three engines. where each answer comes from:
//   postgres 18.6: this chapter's runnable blocks (content/start/sql-and-its-dialects.golden.json)
//   sqlite 3.54.1: recorded with the official wasm build (@sqlite.org/sqlite-wasm 3.54.1-build1,
//                  source id 2026-10-16 555e07ef), in node, by the author
//   mysql 8.4:     not run here. what the 8.4 reference manual says, linked per row
// errors are dead; "the manual says" cells are mute, because they're citations, not runs.

type Cell = { out: string; err?: boolean; cite?: string };
type RowT = { id: string; label: string; sql: string; pg: Cell; lite: Cell; my: Cell; note: string };

const M = "https://dev.mysql.com/doc/refman/8.4/en/";

const ROWS: RowT[] = [
  {
    id: "concat",
    label: "gluing strings",
    sql: "SELECT 'a' || 'b';",
    pg: { out: "ab" },
    lite: { out: "ab" },
    my: { out: "|| means OR, unless sql_mode includes PIPES_AS_CONCAT", cite: `${M}sql-mode.html` },
    note: "|| is the standard's string concatenation. mysql reads it as logical OR by default and wants CONCAT('a', 'b').",
  },
  {
    id: "div",
    label: "dividing integers",
    sql: "SELECT 3 / 5;",
    pg: { out: "0" },
    lite: { out: "0" },
    my: { out: "0.60 (the manual's own example)", cite: `${M}arithmetic-functions.html` },
    note: "postgres and sqlite do integer division on integers, so 3 / 5 is 0. mysql's / always gives a decimal; it has DIV for the integer kind.",
  },
  {
    id: "zero",
    label: "dividing by zero",
    sql: "SELECT 1 / 0;",
    pg: { out: "ERROR 22012: division by zero", err: true },
    lite: { out: "NULL" },
    my: { out: "NULL", cite: `${M}arithmetic-functions.html` },
    note: "postgres stops the statement. sqlite and mysql hand back NULL and carry on, which is how a bad average goes unnoticed for months.",
  },
  {
    id: "eq",
    label: "'Ada' = 'ada'",
    sql: "SELECT 'Ada' = 'ada';",
    pg: { out: "f" },
    lite: { out: "0" },
    my: { out: "true: the default collation, utf8mb4_0900_ai_ci, ignores case", cite: `${M}case-sensitivity.html` },
    note: "the same comparison, two answers. case sensitivity isn't SQL, it's the collation, and mysql's default one ignores case.",
  },
  {
    id: "like",
    label: "LIKE and case",
    sql: "SELECT 'Ada' LIKE 'ada';",
    pg: { out: "f" },
    lite: { out: "1" },
    my: { out: "true by default: LIKE 'a%' matches A and a", cite: `${M}case-sensitivity.html` },
    note: "sqlite's LIKE ignores case for ASCII letters. postgres's doesn't; it has ILIKE for that.",
  },
  {
    id: "ilike",
    label: "ILIKE",
    sql: "SELECT 'Ada' ILIKE 'ada';",
    pg: { out: "t" },
    lite: { out: "near \"'ada'\": syntax error", err: true },
    my: { out: "no ILIKE in the manual: LIKE already ignores case", cite: `${M}string-comparison-functions.html` },
    note: "ILIKE is a postgres extension. the standard doesn't have it.",
  },
  {
    id: "cast",
    label: ":: casts",
    sql: "SELECT '42'::int;",
    pg: { out: "42" },
    lite: { out: "unrecognized token: \":\"", err: true },
    my: { out: "not a cast syntax the manual lists", cite: `${M}cast-functions.html` },
    note: ":: is postgres's own, older spelling. CAST('42' AS integer) is the standard one; mysql spells the type SIGNED: CAST('42' AS SIGNED).",
  },
  {
    id: "fetch",
    label: "FETCH FIRST",
    sql: "SELECT 1 FETCH FIRST 1 ROWS ONLY;",
    pg: { out: "1" },
    lite: { out: "near \"FIRST\": syntax error", err: true },
    my: { out: "the SELECT grammar has LIMIT only", cite: `${M}select.html` },
    note: "the standard's way to say 'only the first n' since SQL:2008. LIMIT isn't standard, yet all three accept it. sqlite even read FETCH as a column alias before it gave up.",
  },
  {
    id: "types",
    label: "a word in an integer",
    sql: "CREATE TABLE t (n integer);\nINSERT INTO t VALUES ('forty-two');",
    pg: { out: "ERROR 22P02: invalid input syntax\nfor type integer: \"forty-two\"", err: true },
    lite: { out: "INSERT works. typeof(n) is 'text'" },
    my: { out: "an error: STRICT_TRANS_TABLES is in the default sql_mode", cite: `${M}sql-mode.html` },
    note: "sqlite's column types are suggestions (a STRICT table makes them rules). postgres checks every value against the column's type.",
  },
  {
    id: "returning",
    label: "RETURNING",
    sql: "INSERT INTO t VALUES (7) RETURNING n;",
    pg: { out: "7" },
    lite: { out: "7" },
    my: { out: "not in the 8.4 INSERT grammar", cite: `${M}insert.html` },
    note: "RETURNING is a postgres extension that sqlite copied. in mysql you ask for LAST_INSERT_ID() afterwards.",
  },
  {
    id: "full",
    label: "FULL OUTER JOIN",
    sql: "SELECT a.n, b.n\nFROM t AS a FULL OUTER JOIN t AS b ON a.n = b.n;",
    pg: { out: "7 | 7" },
    lite: { out: "7 | 7" },
    my: { out: "the join grammar lists LEFT and RIGHT only", cite: `${M}join.html` },
    note: "standard, and in postgres forever. mysql's join grammar has no FULL, so people glue a LEFT and a RIGHT join with UNION.",
  },
];

function Out({ c }: { c: Cell }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <pre
        className="text-12 leading-[1.6] break-words whitespace-pre-wrap"
        style={{ color: c.err ? "var(--dead)" : c.cite ? "var(--mute)" : "var(--hi)" }}
      >
        {c.out}
      </pre>
      {c.cite && (
        <a className="link mt-1 inline-block text-11" href={c.cite} target="_blank" rel="noreferrer">
          the manual
        </a>
      )}
    </div>
  );
}

export function DialectMatrix() {
  const [id, setId] = useState("div");
  const r = ROWS.find((x) => x.id === id)!;
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="one statement on postgres, sqlite and mysql">
      <div className="flex flex-wrap gap-1" role="group" aria-label="pick a statement">
        {ROWS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setId(x.id)}
            aria-pressed={x.id === id}
            className="rounded-xs px-2 py-1 text-11 transition-[background-color,box-shadow,color] duration-200 ease-sfe"
            style={{ boxShadow: x.id === id ? ring("hot", 60) : ring("line-2"), background: x.id === id ? tint("hot", 9) : undefined, color: x.id === id ? "var(--hot)" : "var(--ink)" }}
          >
            {x.label}
          </button>
        ))}
      </div>

      <Well label="the statement">
        <pre className="overflow-x-auto px-3 py-2.5 text-13 leading-[1.6] whitespace-pre text-hi">{r.sql}</pre>
      </Well>

      <div className="grid gap-2 @min-[620px]:grid-cols-3">
        <Well label="postgres 18.6 · ran here">
          <Out c={r.pg} />
        </Well>
        <Well label="sqlite 3.54.1 · recorded">
          <Out c={r.lite} />
        </Well>
        <Well label="mysql 8.4 · the manual says" dashed>
          <Out c={r.my} />
        </Well>
      </div>

      <Narration minLines={2}>{r.note}</Narration>
      <Source>postgres: this page&apos;s goldens · sqlite: the official 3.54.1 wasm build, recorded · mysql: the 8.4 manual, not run</Source>
    </div>
  );
}
