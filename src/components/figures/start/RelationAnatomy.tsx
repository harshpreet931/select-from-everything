"use client";

import { useState } from "react";
import { Narration, Provenance, Words, tint } from "@/components/figures/kit";

// the parts of a relation, on four real rows of shop's customers (ids 3, 9, 10, 42:
// two different Sam Lees, a customer literally named Null, and Ada). pick a word and the part
// of the table it names lights up. types are labelled the way the result grid labels them.

const COLS = [
  { name: "id", type: "int4" },
  { name: "name", type: "text" },
  { name: "city", type: "text" },
  { name: "country", type: "char" },
] as const;

const ROWS: (string | number)[][] = [
  [3, "Sam Lee", "Toronto", "CA"],
  [9, "Sam Lee", "Seoul", "KR"],
  [10, "Null", "Berlin", "DE"],
  [42, "Ada Lovelace", "London", "GB"],
];

type Part = "relation" | "heading" | "attribute" | "domain" | "tuple" | "body" | "degree" | "cardinality" | "key";

const PARTS: { v: Part; sql: string; note: string }[] = [
  { v: "relation", sql: "table", note: "the whole thing: a heading plus a body. this one is called customers. Codd's word is relation, SQL says table." },
  { v: "heading", sql: "the columns", note: "the shape: which columns exist, what each is called and what type it holds. every row has exactly this shape." },
  { v: "attribute", sql: "column", note: "one named slot in the heading, here city. the name is what you use in a query, never a position." },
  { v: "domain", sql: "type", note: "the set of values a column may hold. country is char(2), so 'GBR' can't get in." },
  { v: "tuple", sql: "row", note: "one fact: customer 42 is Ada Lovelace, in London, GB. one value per column." },
  { v: "body", sql: "the rows", note: "all the tuples. in the model it's a set: no order, no duplicates. SQL relaxes the second part." },
  { v: "degree", sql: "number of columns", note: "4 columns, so degree 4. it changes only when the heading does." },
  { v: "cardinality", sql: "number of rows", note: "4 rows here, 2,000 in the real table. it changes with every INSERT and DELETE." },
  { v: "key", sql: "primary key", note: "the column whose value picks out exactly one row. two people are both Sam Lee, so name can't be the key. id can." },
];

export function RelationAnatomy() {
  const [part, setPart] = useState<Part>("relation");
  const info = PARTS.find((p) => p.v === part)!;
  const lit = (r: number | "head" | "type", c: number) => {
    switch (part) {
      case "relation":
        return true;
      case "heading":
        return r === "head" || r === "type";
      case "attribute":
        return c === 2;
      case "domain":
        return r === "type";
      case "tuple":
        return r === 3;
      case "body":
        return typeof r === "number";
      case "key":
        return c === 0 || (typeof r === "number" && r < 2 && c === 1);
      default:
        return false;
    }
  };
  const cell = (on: boolean) => ({
    background: on ? tint("hot", 13) : undefined,
    color: on ? "var(--hi)" : undefined,
    transition: "background-color 200ms var(--ease), color 200ms var(--ease)",
  });
  const count = part === "degree" ? `degree = ${COLS.length}` : part === "cardinality" ? `cardinality = ${ROWS.length}` : null;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="the parts of a relation">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12">
        <span className="text-faint">look at =</span>
        <Words options={PARTS.map((p) => p.v)} value={part} onChange={setPart} label="part of a relation" />
      </div>

      <div className="mx-auto w-full max-w-[34rem]">
        <div className="mb-1.5 flex items-baseline justify-between text-11">
          <span style={{ color: part === "relation" ? "var(--hot)" : "var(--faint)" }}>customers</span>
          <span className="text-hot tabular">{count ?? " "}</span>
        </div>
        <div className="overflow-x-auto rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
          <table className="!my-0 w-full border-collapse font-mono text-12 leading-[1.5]">
            <thead>
              <tr>
                {COLS.map((c, j) => (
                  <th
                    key={c.name}
                    scope="col"
                    className={`border-b-0 font-mono text-12 px-3 pt-2 pb-0 font-normal ${j === 0 ? "text-right" : "text-left"}`}
                    style={{ ...cell(lit("head", j) || part === "degree"), color: lit("head", j) || part === "degree" ? "var(--hi)" : "var(--hi)" }}
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
              <tr>
                {COLS.map((c, j) => (
                  <th
                    key={c.type + j}
                    className={`border-b border-line-2 font-mono px-3 pt-0 pb-1.5 text-11 font-normal ${j === 0 ? "text-right" : "text-left"}`}
                    style={{ ...cell(lit("type", j) || part === "degree"), color: lit("type", j) ? "var(--hot)" : "var(--faint)" }}
                  >
                    {c.type}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={i}>
                  {row.map((v, j) => (
                    <td
                      key={j}
                      className={`border-t border-b-0 border-line font-mono text-12 px-3 py-[5px] whitespace-nowrap tabular ${j === 0 ? "text-right" : "text-left"}`}
                      style={{ ...cell(lit(i, j) || (part === "cardinality" && j === 0)), color: lit(i, j) ? "var(--hi)" : "var(--ink)" }}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Narration minLines={2}>
        <span className="mr-2 font-mono text-11 text-hot not-italic">
          {info.v} = {info.sql}
        </span>
        {info.note}
      </Narration>
      <Provenance trace={{ engine: { version: "18.6", build: "PGlite 0.5.12" }, scenario: "shop customers 3, 9, 10 and 42" }} />
    </div>
  );
}
