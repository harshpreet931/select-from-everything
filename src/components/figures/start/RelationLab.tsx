"use client";

import { useMemo, useState } from "react";
import { Narration, Provenance, ResultTable, SqlPanel, type Cell, type Column } from "@/components/figures/kit";

// closure, by hand: every operation takes a table and gives back a table, so the answer can
// go straight back in as the next question's input. the rows are shop's customers 1 to 12
// (real); the operators here are a few lines of js (a model), and the nested sql under the
// table is the same chain written as subqueries, which the chapter runs on postgres for real.

type Rel = { columns: { name: string; type: string }[]; rows: (string | number | null)[][] };

const BASE: Rel = {
  columns: [
    { name: "id", type: "int4" },
    { name: "name", type: "text" },
    { name: "city", type: "text" },
    { name: "country", type: "char" },
  ],
  rows: [
    [1, "Maya Chen", "San Francisco", "US"],
    [2, "Grace Okafor", "Lagos", "NG"],
    [3, "Sam Lee", "Toronto", "CA"],
    [4, "Zoë Martin", "Paris", "FR"],
    [5, "Zoe Martin", "Lyon", "FR"],
    [6, "José Silva", null, "BR"],
    [7, "Ming Li", "Singapore", "SG"],
    [8, "Sean O'Neil", "Dublin", "IE"],
    [9, "Sam Lee", "Seoul", "KR"],
    [10, "Null", "Berlin", "DE"],
    [11, "Ana Lima", "", "PT"],
    [12, "Ravi Kumar", "Bengaluru", "IN"],
  ],
};

type OpId = "fr" | "id" | "proj2" | "proj1" | "name" | "distinct" | "count";
type Op = { id: OpId; label: string; algebra: string; needs: string[]; apply: (r: Rel) => Rel; sql: (inner: string) => string; note: string };

const col = (r: Rel, n: string) => r.columns.findIndex((c) => c.name === n);
const project = (r: Rel, names: string[]): Rel => ({
  columns: names.map((n) => r.columns[col(r, n)]),
  rows: r.rows.map((row) => names.map((n) => row[col(r, n)])),
});
const nest = (inner: string) => inner.split("\n").map((l) => `  ${l}`).join("\n");
const from = (inner: string) => `FROM (\n${nest(inner)}\n) AS t`;

const OPS: Op[] = [
  {
    id: "fr",
    label: "WHERE country = 'FR'",
    algebra: "σ country = 'FR'",
    needs: ["country"],
    apply: (r) => ({ ...r, rows: r.rows.filter((x) => x[col(r, "country")] === "FR") }),
    sql: (i) => `SELECT *\n${from(i)}\nWHERE country = 'FR'`,
    note: "a selection keeps the rows that pass a test. same columns, fewer rows. still a table.",
  },
  {
    id: "id",
    label: "WHERE id > 6",
    algebra: "σ id > 6",
    needs: ["id"],
    apply: (r) => ({ ...r, rows: r.rows.filter((x) => Number(x[col(r, "id")]) > 6) }),
    sql: (i) => `SELECT *\n${from(i)}\nWHERE id > 6`,
    note: "another selection. it doesn't care whether its input was a stored table or the answer to something else.",
  },
  {
    id: "proj2",
    label: "SELECT name, country",
    algebra: "π name, country",
    needs: ["name", "country"],
    apply: (r) => project(r, ["name", "country"]),
    sql: (i) => `SELECT name, country\n${from(i)}`,
    note: "a projection keeps some columns. same rows, a narrower heading.",
  },
  {
    id: "proj1",
    label: "SELECT country",
    algebra: "π country",
    needs: ["country"],
    apply: (r) => project(r, ["country"]),
    sql: (i) => `SELECT country\n${from(i)}`,
    note: "keep only country. look for repeats: in Codd's model they'd collapse into one row, SQL keeps every copy.",
  },
  {
    id: "name",
    label: "SELECT name",
    algebra: "π name",
    needs: ["name"],
    apply: (r) => project(r, ["name"]),
    sql: (i) => `SELECT name\n${from(i)}`,
    note: "keep only name. two different people are both Sam Lee, so SQL hands back the same row twice.",
  },
  {
    id: "distinct",
    label: "DISTINCT",
    algebra: "δ",
    needs: [],
    apply: (r) => {
      const seen = new Set<string>();
      return { ...r, rows: r.rows.filter((x) => (seen.has(JSON.stringify(x)) ? false : (seen.add(JSON.stringify(x)), true))) };
    },
    sql: (i) => `SELECT DISTINCT *\n${from(i)}`,
    note: "DISTINCT throws duplicate rows away. now it's a set, the way Codd's relations always are.",
  },
  {
    id: "count",
    label: "count(*)",
    algebra: "γ count(*)",
    needs: [],
    apply: (r) => ({ columns: [{ name: "count", type: "int8" }], rows: [[r.rows.length]] }),
    sql: (i) => `SELECT count(*)\n${from(i)}`,
    note: "even a single number comes back as a table: one column, one row. you could put this inside another FROM, too.",
  },
];

const BASE_SQL = "SELECT id, name, city, country\nFROM customers\nWHERE id <= 12";
const MAX = 4;

export function RelationLab() {
  const [chain, setChain] = useState<OpId[]>([]);
  const steps = useMemo(() => {
    const out: { rel: Rel; sql: string }[] = [{ rel: BASE, sql: BASE_SQL }];
    for (const id of chain) {
      const op = OPS.find((o) => o.id === id)!;
      const prev = out[out.length - 1];
      out.push({ rel: op.apply(prev.rel), sql: op.sql(prev.sql) });
    }
    return out;
  }, [chain]);
  const cur = steps[steps.length - 1];
  const lastOp = chain.length ? OPS.find((o) => o.id === chain[chain.length - 1])! : null;
  const can = (o: Op) => chain.length < MAX && o.needs.every((n) => col(cur.rel, n) >= 0) && !(o.id === "count" && cur.rel.columns[0]?.name === "count");
  const columns: Column[] = cur.rel.columns.map((c) => ({ name: c.name, type: c.type }));
  const rows: Cell[][] = cur.rel.rows;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="chain relational operations; every answer is a table">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-12" aria-label="the chain so far">
        <button type="button" className="word" aria-pressed={chain.length === 0} onClick={() => setChain([])} title="start over">
          customers 1 to 12
        </button>
        {chain.map((id, i) => {
          const o = OPS.find((x) => x.id === id)!;
          return (
            <span key={i} className="contents">
              <span aria-hidden className="text-faint">
                →
              </span>
              <button type="button" className="word" aria-pressed={i === chain.length - 1} onClick={() => setChain(chain.slice(0, i + 1))} title="go back to this step">
                {o.algebra}
              </button>
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-12">
        <span className="text-faint">then =</span>
        <div className="flex flex-wrap gap-1">
          {OPS.map((o) => (
            <button key={o.id} type="button" className="act !min-h-7 !px-2 !text-11" disabled={!can(o)} onClick={() => setChain([...chain, o.id])}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @min-[700px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-h-[19rem] min-w-0">
          <ResultTable columns={columns} rows={rows} dense maxRows={12} caption="the current answer" footer={`degree ${cur.rel.columns.length} · ${cur.rel.rows.length} ${cur.rel.rows.length === 1 ? "row" : "rows"}`} />
        </div>
        <SqlPanel code={cur.sql} file="the same chain, as sql" nolines />
      </div>

      <Narration minLines={2}>{lastOp ? lastOp.note : "the starting table: shop's first 12 customers. add an operation, then another. each one eats a table and gives you a table back."}</Narration>
      <Provenance sim="rows: real shop data. operators: model, the chapter runs the sql for real" />
    </div>
  );
}
