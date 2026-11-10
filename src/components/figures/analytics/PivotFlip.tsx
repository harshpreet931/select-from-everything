"use client";

import { useState } from "react";
import { FIG_TABLE, Narration, Provenance, ResultTable, Words, ring, tint, type Cell, type Ink } from "@/components/figures/kit";

// long → wide. the same counts twice, both captured: one row per (month, status), and one row
// per month with a FILTER column per status. pick a wide column, and the long rows that feed it
// light up next to the column they become.

type Col = { name: string; type?: string };
type Res = { columns: Col[]; rows: (string | null)[][] };

export function PivotFlip({
  long,
  wide,
  feeds,
  notes,
  trace,
}: {
  long: Res;
  wide: Res;
  /** wide column → the values of the long table's second column that feed it */
  feeds: Record<string, string[]>;
  notes?: Record<string, string>;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const cols = Object.keys(feeds);
  const [col, setCol] = useState(cols[0]);
  const on = new Set(feeds[col]);
  const tones: (Ink | null)[] = long.rows.map((r) => (on.has(r[1] ?? "") ? "hot" : null));
  const wj = wide.columns.findIndex((c) => c.name === col);
  const wrows: Cell[][] = wide.rows.map((r) => r.map((v, j) => (j === wj ? { v, tone: "hot" as const } : v)));

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="the same counts, long and wide">
      <div className="grid grid-cols-[8ch_minmax(0,1fr)] items-center gap-x-3 text-12">
        <span className="text-faint">column =</span>
        <Words options={cols} value={col} onChange={setCol} label="wide column" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @min-[640px]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="grid gap-1.5">
          <div className="text-11 text-faint">long: GROUP BY month, status ({long.rows.length} rows)</div>
          <ResultTable columns={long.columns.map((c) => c.name)} rows={long.rows} rowTones={tones} group="month" dense footer="none" caption="one row per month and status" />
        </div>
        <div className="grid gap-1.5">
          <div className="text-11 text-faint">wide: GROUP BY month, a FILTER per column ({wide.rows.length} rows)</div>
          <div className="min-w-0 overflow-hidden rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
            <div className="overflow-x-auto">
              <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
                <caption className="sr-only">one row per month</caption>
                <thead>
                  <tr>
                    {wide.columns.map((c, j) => (
                      <th
                        key={c.name}
                        scope="col"
                        className={`border-b border-line-2 px-3 pt-2 pb-1.5 font-normal whitespace-nowrap ${j === 0 ? "text-left" : "text-right"}`}
                        style={{ color: j === wj ? "var(--hot)" : "var(--hi)", background: j === wj ? tint("hot", 10) : undefined, boxShadow: j === wj ? ring("hot", 50) : undefined }}
                      >
                        {j > 0 ? (
                          <button type="button" className="underline-offset-2 hover:underline" onClick={() => setCol(c.name)} disabled={!feeds[c.name]}>
                            {c.name}
                          </button>
                        ) : (
                          c.name
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wrows.map((r, i) => (
                    <tr key={i}>
                      {r.map((cell, j) => {
                        const v = cell !== null && typeof cell === "object" ? cell.v : cell;
                        return (
                          <td
                            key={j}
                            className={`border-t border-line px-3 py-[3px] whitespace-nowrap tabular ${j === 0 ? "text-left" : "text-right"}`}
                            style={{ color: j === wj ? "var(--hot)" : "var(--ink)", background: j === wj ? tint("hot", 10) : undefined }}
                          >
                            {String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <Narration minLines={2}>{notes?.[col]}</Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
