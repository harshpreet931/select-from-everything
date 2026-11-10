"use client";

import { type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { FIG_TABLE, Narration, Provenance, SqlPanel, ring, tint, useReducedMotion } from "@/components/figures/kit";

// an aggregate is a fold: start with an empty state, feed it one row at a time, finish.
// avg keeps two numbers, a running sum and a count, and divides at the end. a NULL leaves the
// state alone. the rows and the final answer are captured; the state in between is the
// arithmetic avg is defined by, done on those captured values.

type Col = { name: string; type?: string };
const num = (v: string) => Number(v);
const show = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function Fold({
  sql,
  table,
  col,
  result,
  trace,
}: {
  sql: string;
  /** the rows, in the order the fold sees them */
  table: { columns: Col[]; rows: (string | null)[][] };
  /** the column being averaged */
  col: string;
  /** the captured answer: columns and its one row */
  result: { columns: Col[]; rows: (string | null)[][] };
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const n = table.rows.length;
  const s = useStepper(n + 2, { interval: 1300 });
  const reduce = useReducedMotion();
  const j = table.columns.findIndex((c) => c.name === col);
  // step 0: empty state. steps 1..n: after row i-1. step n+1: finish
  const fed = Math.min(s.i, n);
  let sum = 0;
  let count = 0;
  for (const r of table.rows.slice(0, fed)) {
    if (r[j] !== null) {
      sum += num(r[j] as string);
      count++;
    }
  }
  const cur = s.i >= 1 && s.i <= n ? table.rows[s.i - 1] : null;
  const done = s.i === n + 1;

  let note: ReactNode;
  if (s.i === 0) note = "avg starts with an empty state: a sum of 0 and a count of 0. nothing has been read yet.";
  else if (done) note = `no rows left. avg divides: ${show(sum)} / ${count} = ${show(sum / count)}. ${n - count} of the ${n} rows never touched the state.`;
  else if (cur && cur[j] === null) note = `this row's ${col} is NULL. avg skips it: the sum and the count stay as they were.`;
  else if (cur) note = `add ${cur[j]} to the sum and 1 to the count.`;

  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" aria-label="avg as a fold over the rows">
      <SqlPanel code={sql} nolines wrap file="query.sql" />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @min-[600px]:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="min-w-0 overflow-x-auto rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
          <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
            <caption className="sr-only">the rows avg reads, one at a time</caption>
            <thead>
              <tr>
                <th className="w-[2.4ch] border-b border-line-2 p-0" aria-label="cursor" />
                {table.columns.map((c, cj) => (
                  <th key={c.name} scope="col" className={`border-b border-line-2 px-3 pt-2 pb-1.5 font-normal whitespace-nowrap ${cj === j ? "text-right" : "text-left"}`} style={{ color: cj === j ? "var(--hot)" : "var(--hi)" }}>
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => {
                const on = s.i === i + 1;
                const past = i < fed;
                return (
                  <tr key={i} className="transition-[background-color] duration-200 ease-sfe" style={{ background: on ? tint("hot", 9) : undefined }}>
                    <td className="p-0 text-center text-12 text-ref" aria-hidden>
                      {on ? "▶" : ""}
                    </td>
                    {r.map((v, cj) => (
                      <td key={cj} className={`border-t border-line px-3 py-[5px] whitespace-nowrap ${cj === j ? "text-right tabular" : ""} ${past || on ? "text-ink" : "text-faint"}`}>
                        {v === null ? <span className="text-faint italic">null</span> : v}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2" aria-live="polite">
          <div className="rounded-md bg-well px-3 py-2.5" style={{ boxShadow: done ? ring("line") : ring("hot", 55) }}>
            <div className="text-11 text-faint">the state</div>
            <div className="mt-1 grid grid-cols-[6ch_1fr] text-13 tabular">
              <span className="text-faint">sum</span>
              <span className="text-hi">{show(sum)}</span>
              <span className="text-faint">count</span>
              <span className="text-hi">{count}</span>
            </div>
          </div>
          <div className="rounded-md bg-well px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]" style={{ opacity: done ? 1 : 0.45 }}>
            <div className="text-11 text-faint">postgres returned</div>
            <div className="mt-1 grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 text-12 tabular">
              {result.columns.map((c, cj) => (
                <span key={c.name} className="contents">
                  <span className="text-faint">{c.name}</span>
                  <span className="truncate text-hi">{done ? (result.rows[0]?.[cj] ?? "null") : "…"}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Narration minLines={2}>{note}</Narration>
      <StepControls s={s} label="row" compact={reduce} />
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
