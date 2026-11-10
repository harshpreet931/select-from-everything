"use client";

import { useState, type ReactNode } from "react";
import { FIG_TABLE, Narration, Provenance, ring, tint } from "@/components/figures/kit";

// strings down the side, patterns across the top, postgres's verdict in every cell. pick a
// pattern to light its column and read what it means. the whole grid is one captured SELECT:
// the first column is the string, every other column is `string <op> pattern`.

type Col = { name: string; type?: string };
export type GridPattern = { col: string; label: string; note: ReactNode };

const show = (v: string | null) => (v === null ? "null" : v === "" ? "''" : v);

export function MatchGrid({
  table,
  patterns,
  rowHead = "name",
  start = 0,
  trace,
}: {
  table: { columns: Col[]; rows: (string | null)[][] };
  patterns: GridPattern[];
  rowHead?: string;
  start?: number;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [pi, setPi] = useState(start);
  const p = patterns[pi];
  const at = (name: string) => table.columns.findIndex((c) => c.name === name);
  const hits = table.rows.filter((r) => r[at(p.col)] === "t").length;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="which strings match which patterns">
      <div className="min-w-0 overflow-x-auto rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
        <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
          <caption className="sr-only">each string against each pattern</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line-2 px-3 pt-2 pb-1.5 text-left font-normal text-hi">
                {rowHead}
              </th>
              {patterns.map((x, i) => (
                <th key={x.col} scope="col" className="border-b border-line-2 px-1 pt-1.5 pb-1.5 align-bottom font-normal">
                  <button
                    type="button"
                    onClick={() => setPi(i)}
                    aria-pressed={i === pi}
                    className="rounded-xs px-1.5 py-0.5 whitespace-nowrap transition-[box-shadow,background-color,color] duration-150 ease-sfe"
                    style={i === pi ? { boxShadow: ring("hot", 60), background: tint("hot", 10), color: "var(--hot)" } : { boxShadow: ring("line"), color: "var(--ink)" }}
                  >
                    {x.label.includes(" ") ? (
                      <span className="flex flex-col items-center leading-[1.35]">
                        <span className="text-[10px] opacity-75">{x.label.slice(0, x.label.indexOf(" "))}</span>
                        <span>{x.label.slice(x.label.indexOf(" ") + 1)}</span>
                      </span>
                    ) : (
                      x.label
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, ri) => (
              <tr key={ri}>
                <td className="border-t border-line px-3 py-[5px] whitespace-nowrap">
                  <span className={r[0] === null ? "text-faint italic" : r[0] === "" ? "text-faint" : r[at(p.col)] === "t" ? "text-hi" : "text-mute"}>{show(r[0])}</span>
                </td>
                {patterns.map((x, i) => {
                  const v = r[at(x.col)];
                  const on = i === pi;
                  return (
                    <td key={x.col} className="border-t border-line px-1 py-[5px] text-center" style={on ? { background: tint("hot", 5) } : undefined}>
                      {v === "t" ? (
                        <span className="inline-flex rounded-xs px-1.5 text-11 leading-[18px]" style={{ color: "var(--live)", background: tint("live", on ? 14 : 8), boxShadow: ring("live", on ? 60 : 35) }}>
                          true
                        </span>
                      ) : v === "f" ? (
                        <span className={`text-11 ${on ? "text-mute" : "text-faint"}`}>false</span>
                      ) : (
                        <span className="inline-flex rounded-xs px-1.5 text-11 leading-[18px] text-mute italic" style={{ outline: "1px dashed var(--faint)", outlineOffset: -1 }}>
                          null
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Narration minLines={2} tag={`${hits} of ${table.rows.length}`}>
        {p.note}
      </Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
