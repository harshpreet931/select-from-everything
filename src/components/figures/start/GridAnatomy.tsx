"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Narration, Provenance, SqlPanel, Words, tint } from "@/components/figures/kit";

// a result grid, labelled. the rows are the real answer to the query on top (shop customers
// 2, 10, 11 and 42, the golden in first-query.golden.json): Grace has no email (NULL), customer 10
// is literally named Null, Ana's city is an empty string, and Ada is Ada.

const SQL = "SELECT id, name, email, city\nFROM customers\nWHERE id IN (2, 10, 11, 42)\nORDER BY id;";
const COLS = [
  { name: "id", type: "int4", num: true },
  { name: "name", type: "text" },
  { name: "email", type: "text" },
  { name: "city", type: "text" },
];
const ROWS: (string | null)[][] = [
  ["2", "Grace Okafor", null, "Lagos"],
  ["10", "Null", "null@example.com", "Berlin"],
  ["11", "Ana Lima", null, ""],
  ["42", "Ada Lovelace", "ada@example.com", "London"],
];

type Part = "column" | "type" | "number" | "NULL" | "empty string" | "'Null'" | "row" | "count";
const PARTS: { v: Part; note: string; hit: (r: number | "name" | "type" | "foot", c: number) => boolean }[] = [
  { v: "column", note: "each column is named by your SELECT list, in that order. name the columns you want and you get exactly those back.", hit: (r) => r === "name" },
  { v: "type", note: "under each name, its type. int4 is a 4-byte integer, text is text of any length. every value in a column has that one type.", hit: (r) => r === "type" },
  { v: "number", note: "numbers sit on the right, like in psql, so their digits line up. text sits on the left.", hit: (r, c) => typeof r === "number" && c === 0 },
  { v: "NULL", note: "Grace and Ana have no email on file. that's NULL: no value at all. it's drawn faint and italic so it can't be mistaken for text.", hit: (r, c) => (r === 0 || r === 2) && c === 2 },
  { v: "empty string", note: "Ana's city is '', an empty string: a value, just an empty one. it's not NULL, and postgres keeps the two apart.", hit: (r, c) => r === 2 && c === 3 },
  { v: "'Null'", note: "customer 10 is literally named Null, four letters. a string that says Null is not NULL. the grid shows it like any other text.", hit: (r, c) => r === 1 && c === 1 },
  { v: "row", note: "one row is one customer: one value (or NULL) per column.", hit: (r) => r === 3 },
  { v: "count", note: "SELECT 4 on top is the command tag postgres sends back after the rows: which command ran, and how many rows it returned. (4 rows) underneath says the same, the way psql does.", hit: (r) => r === "foot" },
];

export function GridAnatomy() {
  const [part, setPart] = useState<Part>("NULL");
  const p = PARTS.find((x) => x.v === part)!;
  const scroller = useRef<HTMLDivElement>(null);
  const picked = useRef(false);
  // on a phone the table scrolls sideways: bring the lit cell into view when the pick changes
  useEffect(() => {
    if (!picked.current) return;
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>("[data-lit]");
    if (!box || !el) return;
    const l = el.offsetLeft;
    if (l < box.scrollLeft || l + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: Math.max(0, l - 16), behavior: "smooth" });
  }, [part]);
  const on = (r: number | "name" | "type" | "foot", c = -1) => p.hit(r, c);
  const hot = (x: boolean): CSSProperties => ({
    background: x ? tint("hot", 15) : undefined,
    boxShadow: x ? "inset 0 0 0 1px color-mix(in srgb, var(--hot) 55%, transparent)" : undefined,
    transition: "background-color 200ms var(--ease), box-shadow 200ms var(--ease)",
  });
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="the parts of a result grid">
      <SqlPanel code={SQL} file="query.sql" nolines />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12">
        <span className="text-faint">point at =</span>
        <Words
          options={PARTS.map((x) => x.v)}
          value={part}
          onChange={(v) => {
            picked.current = true;
            setPart(v);
          }}
          label="part of the grid"
        />
      </div>
      <div className="min-w-0">
        <div className="mb-1 text-11 text-faint tabular">
          <span className="rounded-xs px-0.5" style={hot(on("foot"))}>
            SELECT 4
          </span>
        </div>
        <div ref={scroller} className="relative overflow-x-auto rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
          <table className="!my-0 w-full border-collapse font-mono text-12 leading-[1.5]">
            <thead>
              <tr>
                {COLS.map((c, j) => (
                  <th key={c.name} scope="col" className={`border-b border-line-2 px-2 pt-2 pb-1.5 font-mono text-12 font-normal whitespace-nowrap @min-[520px]:px-3 ${c.num ? "text-right" : "text-left"}`}>
                    <span className="rounded-xs px-0.5 text-hi" style={hot(on("name", j))}>
                      {c.name}
                    </span>
                    <span className="ml-1.5 rounded-xs px-0.5 text-11 text-faint" style={hot(on("type", j))}>
                      {c.type}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={i} style={on(i) ? { background: tint("hot", 10) } : undefined}>
                  {row.map((v, j) => (
                    <td key={j} className={`border-t border-b-0 border-line px-2 py-[5px] font-mono text-12 whitespace-nowrap tabular @min-[520px]:px-3 ${COLS[j].num ? "text-right" : "text-left"}`} style={hot(on(i, j) && !on(i))} data-lit={on(i, j) && !on(i) ? "" : undefined}>
                      {v === null ? <span className="text-faint italic">null</span> : v === "" ? <span className="text-faint">&apos;&apos;</span> : <span className="text-ink">{v}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1 text-11 text-faint tabular">
          <span className="rounded-xs px-0.5" style={hot(on("foot"))}>
            (4 rows)
          </span>
        </div>
      </div>
      <Narration minLines={2}>{p.note}</Narration>
      <Provenance trace={{ engine: { version: "18.6", build: "PGlite 0.5.12" }, scenario: "the shop database, customers 2, 10, 11 and 42" }} />
    </div>
  );
}
