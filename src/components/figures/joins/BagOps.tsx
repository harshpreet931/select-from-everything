"use client";

import { useState } from "react";
import { FIG_TABLE, Narration, Provenance, Row, SqlPanel, Words, ring, tint } from "@/components/figures/kit";

// UNION, INTERSECT and EXCEPT, with and without ALL, on two small baskets with duplicates and a
// NULL. every result is a captured run (the real query, its real rows). the table under the
// baskets counts copies: how many of each item were on each side, and how many came out.

type Col = { name: string; type?: string };
type Res = { sql: string; note?: string; columns: Col[]; rows: (string | null)[][] };

const OPS = ["UNION", "INTERSECT", "EXCEPT"] as const;
const RULE: Record<string, string> = {
  "UNION | ALL": "m + n: everything from both, stacked",
  "UNION | distinct": "1 if it's on either side",
  "INTERSECT | ALL": "the smaller of m and n",
  "INTERSECT | distinct": "1 if it's on both sides",
  "EXCEPT | ALL": "m − n, but never below 0",
  "EXCEPT | distinct": "1 if it's on the left and not the right",
};

const key = (v: string | null) => v ?? "\u0000null";
const tally = (rows: (string | null)[][]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r[0]), (m.get(key(r[0])) ?? 0) + 1);
  return m;
};

function Bag({ label, rows, tone }: { label: string; rows: (string | null)[][]; tone?: "live" }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <div className="text-11 text-faint">{label}</div>
      <div className="flex min-h-6 flex-wrap gap-1">
        {rows.length === 0 && <span className="text-11 text-faint italic">no rows</span>}
        {rows.map((r, i) => (
          <span
            key={i}
            className="inline-flex rounded-xs px-1.5 text-11 leading-[20px]"
            style={{ boxShadow: tone ? ring("live", 60) : ring("line-2"), background: tone ? tint("live", 12) : undefined }}
          >
            {r[0] === null ? <span className="text-faint italic">null</span> : <span className="text-hi">{r[0]}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BagOps({
  left,
  right,
  runs,
  names = ["left", "right"],
  trace,
}: {
  left: Res;
  right: Res;
  /** `${op} | ALL` or `${op} | distinct` → the captured run */
  runs: Record<string, Res>;
  names?: [string, string];
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [op, setOp] = useState<(typeof OPS)[number]>("UNION");
  const [all, setAll] = useState<"distinct" | "ALL">("distinct");
  const k = `${op} | ${all}`;
  const run = runs[k];
  const L = tally(left.rows);
  const R = tally(right.rows);
  const O = tally(run?.rows ?? []);
  const items = [...new Set([...L.keys(), ...R.keys()])].sort((a, b) => (a.startsWith("\u0000") ? 1 : b.startsWith("\u0000") ? -1 : a < b ? -1 : 1));
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="set operations on two baskets, with the copies counted">
      <div>
        <Row k="op =" w="6ch">
          <Words label="set operation" options={[...OPS]} value={op} onChange={setOp} />
        </Row>
        <Row k="ALL =" w="6ch" last>
          <Words label="duplicates" options={[{ v: "distinct" as const, label: "no (distinct)" }, { v: "ALL" as const, label: "yes, ALL" }]} value={all} onChange={setAll} />
        </Row>
      </div>
      {run && <SqlPanel code={run.sql} file="query.sql" marks={[{ from: run.sql.indexOf(op), to: run.sql.indexOf(op) + op.length + (all === "ALL" ? 4 : 0), tone: "hot" }]} wrap />}
      <div className="grid min-w-0 gap-3 @min-[560px]:grid-cols-3">
        <Bag label={names[0]} rows={left.rows} />
        <Bag label={names[1]} rows={right.rows} />
        <Bag label={`${op}${all === "ALL" ? " ALL" : ""}: ${run?.rows.length ?? 0} rows`} rows={run?.rows ?? []} tone="live" />
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className={`w-full border-collapse text-12 ${FIG_TABLE}`} aria-label="copies of each item on each side and in the result">
          <thead>
            <tr className="text-11 text-faint">
              <th className="border-0 px-2 py-1 text-left font-normal">item</th>
              <th className="border-0 px-2 py-1 text-right font-normal">m, {names[0]}</th>
              <th className="border-0 px-2 py-1 text-right font-normal">n, {names[1]}</th>
              <th className="border-0 px-2 py-1 text-right font-normal">out</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const o = O.get(it) ?? 0;
              return (
                <tr key={it} className="border-t border-line">
                  <td className="px-2 py-1">{it.startsWith("\u0000") ? <span className="text-faint italic">null</span> : it}</td>
                  <td className="px-2 py-1 text-right tabular text-mute">{L.get(it) ?? 0}</td>
                  <td className="px-2 py-1 text-right tabular text-mute">{R.get(it) ?? 0}</td>
                  <td className="px-2 py-1 text-right tabular" style={{ color: o ? "var(--live)" : "var(--faint)" }}>
                    {o}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-1.5 px-2 text-11 text-faint">out = {RULE[k]}</div>
      </div>
      <Narration minLines={2}>{run?.note}</Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
