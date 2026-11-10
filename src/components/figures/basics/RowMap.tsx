"use client";

import { useState } from "react";
import { Narration, Provenance, Words, ring, tint } from "@/components/figures/kit";
import { tokenizeSql, tokStyle } from "@/components/figures/kit/sql";

// SELECT as a map: every row FROM hands over goes through the same select list, and each item
// fills one cell of one output row. pick a row and an item: the input cells it reads light up,
// and so does the cell it writes. the input rows and the output rows are both captured (the
// same rows, by id); which columns an item reads is just its syntax, given as props.

type Col = { name: string; type?: string };
export type MapItem = { sql: string; reads: string[]; note?: string };

const isNum = (t?: string) => !!t && /^(int|numeric|float)/.test(t);
const cell = (v: string | null) => (v === null ? "null" : v === "" ? "''" : v);

function Code({ code }: { code: string }) {
  return (
    <>
      {tokenizeSql(code).map((t, i) => (
        <span key={i} style={tokStyle(t.k)}>
          {t.t}
        </span>
      ))}
    </>
  );
}

export function RowMap({
  input,
  output,
  items,
  rowLabel = 1,
  trace,
}: {
  /** FROM's rows: every column the items read */
  input: { columns: Col[]; rows: (string | null)[][] };
  /** SELECT's rows, same order, one column per item */
  output: { columns: Col[]; rows: (string | null)[][] };
  items: MapItem[];
  /** which input column names a row on the picker */
  rowLabel?: number;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [ri, setRi] = useState(0);
  const [ii, setIi] = useState(items.length > 1 ? 1 : 0);
  const item = items[ii];
  const inRow = input.rows[ri];
  const outRow = output.rows[ri];
  const reads = new Set(item.reads);

  const box = (title: string, cols: Col[], row: (string | null)[], hot: (j: number) => boolean) => (
    <div className="min-w-0 rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="border-b border-line px-3 py-1 text-11 text-faint">{title}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-1.5 p-2">
        {cols.map((c, j) => {
          const on = hot(j);
          return (
            <div
              key={c.name}
              className="min-w-0 rounded-xs px-2 py-1 transition-[box-shadow,background-color] duration-200 ease-sfe"
              style={on ? { boxShadow: ring("hot", 60), background: tint("hot", 10) } : { boxShadow: ring("line") }}
            >
              <div className="truncate text-[10.5px] text-faint">
                {c.name}
                {c.type ? <span className="ml-1">{c.type}</span> : null}
              </div>
              <div className={`truncate text-12 tabular ${row[j] === null ? "text-faint italic" : on ? "text-hi" : "text-ink"} ${isNum(c.type) ? "" : ""}`}>{cell(row[j])}</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const readVals = input.columns.flatMap((c, j) => (reads.has(c.name) ? [`${c.name} = ${cell(inRow[j])}`] : []));
  const outName = output.columns[ii]?.name;
  const note = `${item.sql} ${readVals.length ? `reads ${readVals.join(" and ")}` : "reads no column at all"} and fills ${outName} = ${cell(outRow[ii])}.${item.note ? ` ${item.note}` : ""}`;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="SELECT turns each input row into one output row">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line pb-2 text-12 @min-[520px]:grid-cols-[6ch_minmax(0,1fr)]">
        <span className="pt-0.5 text-faint">row =</span>
        <Words options={input.rows.map((r, i) => ({ v: i, label: cell(r[rowLabel]) }))} value={ri} onChange={setRi} label="input row" />
      </div>
      {box(`a row from FROM (${input.columns.length} of its columns)`, input.columns, inRow, (j) => reads.has(input.columns[j].name))}
      <div className="rounded-md bg-well px-3 py-2 text-12 shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="mb-1 text-11 text-faint">the select list, run once for this row</div>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
          <span style={tokStyle("kw")}>SELECT</span>
          {items.map((it, i) => (
            <span key={i} className="inline-flex items-center">
              <button
                type="button"
                onClick={() => setIi(i)}
                aria-pressed={i === ii}
                className="rounded-xs px-1.5 py-0.5 text-left transition-[box-shadow,background-color] duration-150 ease-sfe"
                style={i === ii ? { boxShadow: ring("hot", 60), background: tint("hot", 10) } : { boxShadow: ring("line") }}
              >
                <Code code={it.sql} />
              </button>
              {i < items.length - 1 && <span className="text-faint">,</span>}
            </span>
          ))}
        </div>
      </div>
      {box("the row SELECT hands on", output.columns, outRow, (j) => j === ii)}
      <Narration minLines={2}>{note}</Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
