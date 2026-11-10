"use client";

import { useState } from "react";
import { Narration, Provenance, ResultTable, Row, Words, Sql } from "@/components/figures/kit";

// the relational algebra's operators on three tiny hand-drawn relations: pick one, see its
// input and output relation, how SQL spells it, and which plan nodes run it in postgres. the
// results are computed here from the inputs, as sets (the algebra) unless the operator says
// otherwise. textbook material: "drawn by hand".

type Rel = { name: string; columns: string[]; rows: (string | number)[][] };

const R: Rel = { name: "customers", columns: ["id", "name", "city"], rows: [[1, "Maya", "London"], [2, "Grace", "Paris"], [3, "Sam", "London"], [4, "Zoë", "Berlin"]] };
const S: Rel = { name: "orders", columns: ["oid", "cust"], rows: [[101, 1], [102, 2], [103, 1]] };
const T: Rel = { name: "newsletter", columns: ["name", "city"], rows: [["Sam", "London"], ["Ada", "London"]] };
const RN: Rel = { name: "π name,city (customers)", columns: ["name", "city"], rows: R.rows.map((r) => [r[1], r[2]]) };

const uniq = (rows: (string | number)[][]) => rows.filter((r, i) => rows.findIndex((x) => JSON.stringify(x) === JSON.stringify(r)) === i);

type Op = { v: string; sym: string; name: string; expr: string; ins: Rel[]; out: Rel; sql: string; plan: string; note: string };

const OPS: Op[] = [
  {
    v: "σ", sym: "σ", name: "selection", expr: "σ city = 'London' (customers)", ins: [R],
    out: { name: "result", columns: R.columns, rows: R.rows.filter((r) => r[2] === "London") },
    sql: "SELECT * FROM customers WHERE city = 'London'",
    plan: "a Filter (or Index Cond) inside a scan or join node",
    note: "keeps the rows where the condition holds. same columns, fewer rows. in SQL it's WHERE; in a plan it's rarely a node of its own: the planner pushes it into the scan.",
  },
  {
    v: "π", sym: "π", name: "projection", expr: "π city (customers)", ins: [R],
    out: { name: "result", columns: ["city"], rows: uniq(R.rows.map((r) => [r[2]])) },
    sql: "SELECT DISTINCT city FROM customers",
    plan: "each node's output columns, plus a HashAggregate or Unique for DISTINCT",
    note: "keeps some columns. in the algebra a relation is a set, so the two Londons collapse into one. SQL's SELECT keeps both unless you say DISTINCT.",
  },
  {
    v: "×", sym: "×", name: "product", expr: "customers × orders", ins: [R, S],
    out: { name: "result", columns: [...R.columns, ...S.columns], rows: R.rows.flatMap((r) => S.rows.map((s) => [...r, ...s])) },
    sql: "SELECT * FROM customers CROSS JOIN orders",
    plan: "a Nested Loop with no join condition",
    note: "every row of one with every row of the other: 4 × 3 = 12 rows. nobody wants it on its own; every join is defined from it.",
  },
  {
    v: "⋈", sym: "⋈", name: "join", expr: "customers ⋈ id = cust orders", ins: [R, S],
    out: { name: "result", columns: [...R.columns, ...S.columns], rows: R.rows.flatMap((r) => S.rows.filter((s) => s[1] === r[0]).map((s) => [...r, ...s])) },
    sql: "SELECT * FROM customers JOIN orders ON orders.cust = customers.id",
    plan: "Nested Loop, Hash Join or Merge Join",
    note: "a selection over a product: σ id = cust (customers × orders). the algebra defines it that way; no executor runs it that way.",
  },
  {
    v: "∪", sym: "∪", name: "union", expr: "π name,city (customers) ∪ newsletter", ins: [RN, T],
    out: { name: "result", columns: ["name", "city"], rows: uniq([...RN.rows, ...T.rows]) },
    sql: "SELECT name, city FROM customers UNION SELECT name, city FROM newsletter",
    plan: "Append, then a HashAggregate or Unique to drop duplicates",
    note: "rows in either. both sides need the same columns. Sam is in both and comes out once; UNION ALL would keep him twice.",
  },
  {
    v: "−", sym: "−", name: "difference", expr: "π name,city (customers) − newsletter", ins: [RN, T],
    out: { name: "result", columns: ["name", "city"], rows: RN.rows.filter((r) => !T.rows.some((t) => JSON.stringify(t) === JSON.stringify(r))) },
    sql: "SELECT name, city FROM customers EXCEPT SELECT name, city FROM newsletter",
    plan: "HashSetOp Except, or SetOp Except over sorted input",
    note: "rows in the first that aren't in the second. Sam is subscribed, so he's out.",
  },
  {
    v: "ρ", sym: "ρ", name: "rename", expr: "ρ c (customers)", ins: [R],
    out: { name: "c", columns: R.columns, rows: R.rows },
    sql: "SELECT * FROM customers AS c",
    plan: "nothing: it only changes names, so it shows up as an alias in the plan text",
    note: "gives a relation (or a column) a new name. it's what makes a self join possible: customers twice, under two names.",
  },
];

export function AlgebraMap() {
  const [pick, setPick] = useState("σ");
  const op = OPS.find((o) => o.v === pick)!;
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12">
      <Row k="operator =" w="10ch" last>
        <Words label="operator" options={OPS.map((o) => ({ v: o.v, label: `${o.sym} ${o.name}` }))} value={pick} onChange={setPick} />
      </Row>
      <div className="text-14 text-hi">{op.expr}</div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 @min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-3">
          {op.ins.map((r) => (
            <div key={r.name} className="grid min-w-0 gap-1">
              <div className="text-11 text-faint">{r.name}</div>
              <ResultTable columns={r.columns} rows={r.rows} dense footer="none" />
            </div>
          ))}
        </div>
        <div className="grid min-w-0 content-start gap-1">
          <div className="text-11 text-faint">
            {op.sym} → {op.out.rows.length} {op.out.rows.length === 1 ? "row" : "rows"}
          </div>
          <ResultTable columns={op.out.columns} rows={op.out.rows} rowTones={op.out.rows.map(() => "live")} dense footer="none" maxRows={12} />
        </div>
      </div>
      <div className="grid min-w-0 gap-1.5 rounded-md px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="grid grid-cols-[6ch_minmax(0,1fr)] gap-x-3">
          <span className="text-11 text-faint">SQL</span>
          <Sql code={op.sql} className="text-12 break-words" />
        </div>
        <div className="grid grid-cols-[6ch_minmax(0,1fr)] gap-x-3">
          <span className="text-11 text-faint">plan</span>
          <span className="text-ink">{op.plan}</span>
        </div>
      </div>
      <Narration minLines={2}>{op.note}</Narration>
      <Provenance drawn="the algebra, on three made-up relations" />
    </div>
  );
}
