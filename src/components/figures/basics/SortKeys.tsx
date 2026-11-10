"use client";

import { useState } from "react";
import { FIG_TABLE, Narration, Provenance, SqlPanel, Words, tint } from "@/components/figures/kit";

// sort keys, left to right, and the ties they leave. every ORDER BY on the switch is a captured
// run; the figure brackets the runs of rows that are equal on every sort key so far. inside a
// bracket the order is postgres's choice, not yours: the next key (or nothing) decides it.

type Col = { name: string; type?: string };
export type SortRun = { sql: string; columns: Col[]; rows: (string | null)[][]; keys: string[] };

const isNum = (t?: string) => !!t && /^(int|numeric|float|money)/.test(t);

export function SortKeys({
  runs,
  start,
  trace,
}: {
  /** label (the ORDER BY list) → captured run with its sort-key columns */
  runs: Record<string, SortRun>;
  start?: string;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const labels = Object.keys(runs);
  const [pick, setPick] = useState(start ?? labels[0]);
  const run = runs[pick];
  const ki = run.keys.map((k) => run.columns.findIndex((c) => c.name === k));
  const tie = (a: (string | null)[], b: (string | null)[]) => ki.every((j) => a[j] === b[j]);
  // tie groups: [start, end] index runs of equal keys
  const groups: [number, number][] = [];
  run.rows.forEach((r, i) => {
    const g = groups[groups.length - 1];
    if (g && tie(run.rows[g[1]], r)) g[1] = i;
    else groups.push([i, i]);
  });
  const ties = groups.filter(([a, b]) => b > a);
  const tied = ties.reduce((n, [a, b]) => n + b - a + 1, 0);
  const groupOf = (i: number) => groups.find(([a, b]) => i >= a && i <= b)!;
  const at = run.sql.indexOf("ORDER BY");
  const marks = at >= 0 ? [{ from: at, to: run.sql.length - (run.sql.endsWith(";") ? 1 : 0), tone: "hot" as const }] : [];

  const note = ties.length
    ? `${tied} of ${run.rows.length} rows sit in ${ties.length} ${ties.length === 1 ? "tie" : "ties"}: equal on ${run.keys.join(", ")}. inside a bracket, postgres may return them in any order, and the same query can do it differently tomorrow.`
    : `no ties left: ${run.keys.join(", ")} tell every row apart, so the order is fixed. that's a total order, and it's what every query on this site ends with.`;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="sort keys and the ties they leave">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line pb-2 text-12 @min-[520px]:grid-cols-[10ch_minmax(0,1fr)]">
        <span className="pt-0.5 text-faint">ORDER BY =</span>
        <Words options={labels} value={pick} onChange={setPick} label="sort keys" />
      </div>
      <SqlPanel code={run.sql} file="query.sql" marks={marks} />
      <div className="min-w-0 overflow-x-auto rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
        <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
          <caption className="sr-only">the sorted rows, with ties bracketed</caption>
          <thead>
            <tr>
              <th className="w-6 border-b border-line-2 p-0" aria-label="ties" />
              {run.columns.map((c, j) => (
                <th key={c.name} scope="col" className={`border-b border-line-2 px-3 pt-2 pb-1.5 font-normal whitespace-nowrap ${isNum(c.type) ? "text-right" : "text-left"}`}>
                  <span style={{ color: ki.includes(j) ? "var(--hot)" : "var(--hi)" }}>{c.name}</span>
                  {ki.includes(j) && <span className="ml-1 text-[10px] text-faint">{ki.indexOf(j) + 1}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {run.rows.map((r, i) => {
              const [a, b] = groupOf(i);
              const inTie = b > a;
              return (
                <tr key={`${pick}${i}`} style={{ background: inTie ? tint("hot", 5) : undefined }}>
                  <td className="relative p-0 align-middle">
                    {inTie && (
                      <span
                        aria-hidden
                        className="absolute left-2.5 w-[3px]"
                        style={{ top: i === a ? 6 : 0, bottom: i === b ? 6 : 0, background: "var(--hot)", borderRadius: 2 }}
                      />
                    )}
                    {inTie && i === a && <span className="sr-only">tie of {b - a + 1} rows</span>}
                  </td>
                  {r.map((v, j) => (
                    <td key={j} className={`border-t border-line px-3 py-[4px] whitespace-nowrap ${isNum(run.columns[j].type) ? "text-right tabular" : ""} ${ki.includes(j) ? "text-hi" : "text-mute"}`}>
                      {v === null ? <span className="text-faint italic">null</span> : v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Narration minLines={3}>{note}</Narration>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 text-11 text-faint">
          <span aria-hidden className="inline-block h-3 w-[3px] rounded-xs" style={{ background: "var(--hot)" }} /> a tie: equal on every sort key
        </span>
        {trace && <Provenance trace={trace} />}
      </div>
    </div>
  );
}
