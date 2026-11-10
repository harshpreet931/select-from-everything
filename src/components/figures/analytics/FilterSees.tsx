"use client";

import { useState } from "react";
import { FIG_TABLE, Narration, Provenance, Words, ring, tint } from "@/components/figures/kit";

// which rows each aggregate counts. one table of rows, a column per aggregate saying whether
// that aggregate's FILTER is true for the row (postgres evaluated the conditions), and the
// aggregates' real results. pick an aggregate: the rows it counted are live, the rows its
// FILTER kept out are struck.

type Col = { name: string; type?: string };
type Res = { columns: Col[]; rows: (string | null)[][] };

export function FilterSees({
  rows,
  result,
  show,
  notes,
  trace,
}: {
  /** the rows: the columns in `show`, then one boolean column per aggregate */
  rows: Res;
  /** one row: one column per aggregate, same names */
  result: Res;
  /** how many leading columns are data (the rest are the per-aggregate conditions) */
  show: number;
  notes?: Record<string, string>;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const aggs = rows.columns.slice(show).map((c) => c.name);
  const [agg, setAgg] = useState(aggs[1] ?? aggs[0]);
  const aj = rows.columns.findIndex((c) => c.name === agg);
  const rj = result.columns.findIndex((c) => c.name === agg);
  const counted = rows.rows.filter((r) => r[aj] === "t").length;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="which rows each aggregate counts">
      <div className="grid grid-cols-[12ch_minmax(0,1fr)] items-center gap-x-3 text-12">
        <span className="text-faint">aggregate =</span>
        <Words options={aggs} value={agg} onChange={setAgg} label="aggregate" />
      </div>
      <div className="min-w-0 overflow-hidden rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="overflow-x-auto">
          <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
            <caption className="sr-only">the rows, and which aggregates count each one</caption>
            <thead>
              <tr>
                {rows.columns.map((c, j) => (
                  <th
                    key={c.name}
                    scope="col"
                    className={`border-b border-line-2 px-3 pt-2 pb-1.5 font-normal whitespace-nowrap ${j === 0 ? "text-right" : j < show ? "text-left" : "text-center"}`}
                    style={{ color: j === aj ? "var(--hot)" : j < show ? "var(--hi)" : "var(--faint)" }}
                  >
                    {j < show ? c.name : <button type="button" className="underline-offset-2 hover:underline" onClick={() => setAgg(c.name)}>{c.name}</button>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.rows.map((r, i) => {
                const yes = r[aj] === "t";
                return (
                  <tr key={i} className="transition-[background-color,opacity] duration-200 ease-sfe" style={{ background: yes ? tint("live", 12) : undefined, boxShadow: yes ? "inset 2px 0 0 var(--live)" : undefined }}>
                    {r.map((v, j) => (
                      <td
                        key={j}
                        className={`border-t border-line px-3 py-[4px] whitespace-nowrap tabular ${j === 0 ? "text-right" : j < show ? "text-left" : "text-center"}`}
                        style={{
                          color: j >= show ? (v === "t" ? (j === aj ? "var(--live)" : "var(--mute)") : "var(--faint)") : yes ? "var(--ink)" : "var(--faint)",
                          textDecoration: j < show && !yes ? "line-through" : undefined,
                        }}
                      >
                        {j >= show ? (v === "t" ? "✓" : "·") : v}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={show} className="border-t border-line-2 px-3 py-1.5 text-right text-11 text-faint">
                  postgres returned
                </td>
                {aggs.map((a) => {
                  const j = result.columns.findIndex((c) => c.name === a);
                  return (
                    <td key={a} className="border-t border-line-2 px-3 py-1.5 text-center text-12 tabular" style={{ color: a === agg ? "var(--hot)" : "var(--ink)", boxShadow: a === agg ? ring("hot", 50) : undefined }}>
                      {result.rows[0]?.[j]}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <Narration minLines={2}>
        <span className="font-mono text-11 text-hot not-italic">
          {agg}: {counted} of {rows.rows.length} rows counted, result {result.rows[0]?.[rj]}.
        </span>{" "}
        {notes?.[agg]}
      </Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
