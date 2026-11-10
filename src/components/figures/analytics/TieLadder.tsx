"use client";

import { useState } from "react";
import { Chip, Narration, Provenance, Words } from "@/components/figures/kit";

// ties, one line per value. pick a numbering function and every row gets its number from the
// capture (row_number, rank and dense_rank computed by postgres in one query). the gaps rank
// leaves after a tie are drawn as the numbers nobody got, dashed: they're "not there".

type Col = { name: string; type?: string };

export function TieLadder({
  columns,
  rows,
  name,
  value,
  fns,
  notes,
  tied = "tied",
  trace,
}: {
  columns: Col[];
  rows: (string | null)[][];
  /** the column with a row's label */
  name: string;
  /** the ORDER BY column: rows with equal values tie */
  value: string;
  /** the numbering columns, in the order to offer them */
  fns: string[];
  notes?: Record<string, string>;
  /** the word after a group's size ("3 tied"); empty to leave it out */
  tied?: string;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [fn, setFn] = useState(fns[0]);
  const at = (c: string) => columns.findIndex((x) => x.name === c);
  const nj = at(name);
  const vj = at(value);
  const fj = at(fn);
  // runs of equal values, in result order
  const groups: { v: string | null; rows: (string | null)[][] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.v === r[vj]) last.rows.push(r);
    else groups.push({ v: r[vj], rows: [r] });
  }
  let prevMax = 0;
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="tied rows and the numbers each function gives them">
      {fns.length > 1 && (
        <div className="grid grid-cols-[8ch_minmax(0,1fr)] items-center gap-x-3 py-1 text-12">
          <span className="text-faint">number =</span>
          <Words options={fns.map((f) => ({ v: f, label: `${f}()` }))} value={fn} onChange={setFn} label="numbering function" />
        </div>
      )}
      <div className="grid gap-2">
        {groups.map((g, gi) => {
          const nums = g.rows.map((r) => Number(r[fj]));
          const lo = Math.min(...nums);
          const skipped = Array.from({ length: Math.max(0, lo - prevMax - 1) }, (_, k) => prevMax + 1 + k);
          prevMax = Math.max(prevMax, ...nums);
          return (
            <div key={gi} className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-md bg-well px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)] @min-[520px]:grid-cols-[9ch_minmax(0,1fr)]">
              <div className="text-11 text-faint">
                {value} <span className="text-12 text-hi tabular">{g.v ?? "null"}</span>
                {g.rows.length > 1 && tied && <span className="ml-1.5 @min-[520px]:ml-0 @min-[520px]:block">{g.rows.length} {tied}</span>}
              </div>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {skipped.map((n) => (
                  <Chip key={`s${n}`} dashed tone="faint" title="a number rank skips after a tie">
                    <span className="line-through tabular">{n}</span>
                  </Chip>
                ))}
                {g.rows.map((r, i) => (
                  <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-xs px-1.5 text-11 leading-[22px] shadow-[inset_0_0_0_1px_var(--line-2)]">
                    <span className="min-w-[2ch] text-right text-12 text-hot tabular">{r[fj]}</span>
                    <span className="truncate text-ink">{r[nj]}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Narration minLines={2}>{notes?.[fn]}</Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
