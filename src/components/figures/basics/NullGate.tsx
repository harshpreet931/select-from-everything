"use client";

import { useState, type ReactNode } from "react";
import { FIG_TABLE, Legend, Narration, Provenance, SqlPanel, Words, ring, tint } from "@/components/figures/kit";

// the WHERE gate. five customers walk up to a condition on their city; postgres's answer for
// each one is true, false or unknown, and WHERE lets through only true. the reader picks the
// condition, wraps it in NOT, and drops NULLs into rows to watch a row fall out of both
// WHERE p and WHERE NOT p.
//
// nothing is evaluated here: every verdict is looked up in a captured result (one SELECT over
// the five cities, every condition and its NOT as a column), so the figure says exactly what
// postgres said. the people are real shop customers with their real cities.

type Col = { name: string; type?: string };
export type GatePred = {
  /** the button label, also the sql */
  sql: string;
  /** the captured column holding p, and the one holding NOT (p) */
  col: string;
  notCol: string;
  /** one or two sentences for the narration */
  note: ReactNode;
};

type Verdict = "t" | "f" | null;

const shown = (v: string | null) => (v === null ? "null" : v === "" ? "''" : `'${v}'`);

function VerdictChip({ v }: { v: Verdict }) {
  if (v === "t")
    return (
      <span className="inline-flex rounded-xs px-1.5 text-11 leading-[20px]" style={{ color: "var(--live)", background: tint("live", 10), boxShadow: ring("live", 55) }}>
        true
      </span>
    );
  if (v === "f") return <span className="inline-flex rounded-xs px-1.5 text-11 leading-[20px] text-mute shadow-[inset_0_0_0_1px_var(--line-2)]">false</span>;
  return (
    <span className="inline-flex rounded-xs px-1.5 text-11 leading-[20px] text-mute italic" style={{ outline: "1px dashed var(--faint)", outlineOffset: -1 }}>
      unknown
    </span>
  );
}

export function NullGate({
  table,
  people,
  preds,
  start = 0,
  trace,
}: {
  /** the captured truth table: a `city` column, then the condition columns */
  table: { columns: Col[]; rows: (string | null)[][] };
  /** who walks up to the gate. city must be one of the table's cities */
  people: { name: string; city: string | null }[];
  preds: GatePred[];
  start?: number;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [pi, setPi] = useState(Math.min(start, preds.length - 1));
  const [neg, setNeg] = useState(false);
  const [nulled, setNulled] = useState<boolean[]>(() => people.map(() => false));
  const p = preds[pi];
  const cityAt = table.columns.findIndex((c) => c.name === "city");
  const colAt = (name: string) => table.columns.findIndex((c) => c.name === name);
  const look = (city: string | null, col: string): Verdict => {
    const r = table.rows.find((x) => x[cityAt] === city);
    const v = r ? r[colAt(col)] : null;
    return v === "t" || v === "f" ? v : null;
  };

  const rows = people.map((who, i) => {
    const city = nulled[i] ? null : who.city;
    const v = look(city, neg ? p.notCol : p.col);
    const other = look(city, neg ? p.col : p.notCol);
    return { who, city, v, other, i };
  });
  const kept = rows.filter((r) => r.v === "t").length;
  const keptOther = rows.filter((r) => r.other === "t").length;
  const neither = rows.filter((r) => r.v !== "t" && r.other !== "t").length;
  const cond = neg ? `NOT (${p.sql})` : p.sql;
  const sql = `SELECT name, city\nFROM customers\nWHERE ${cond};`;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="the WHERE gate: which rows a condition lets through">
      <div className="grid gap-0">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line py-2 text-12 @min-[560px]:grid-cols-[7ch_minmax(0,1fr)]">
          <span className="text-faint">WHERE =</span>
          <Words options={preds.map((x, i) => ({ v: i, label: x.sql }))} value={pi} onChange={setPi} label="condition" />
        </div>
        <div className="grid grid-cols-[7ch_minmax(0,1fr)] gap-x-3 py-2 text-12">
          <span className="text-faint">wrap =</span>
          <Words
            options={[
              { v: 0, label: "as is" },
              { v: 1, label: "NOT ( … )" },
            ]}
            value={neg ? 1 : 0}
            onChange={(v) => setNeg(v === 1)}
            label="wrap the condition in NOT"
          />
        </div>
      </div>

      <SqlPanel code={sql} nolines file="query.sql" marks={[{ line: 3, from: 6, to: 6 + cond.length, tone: "hot" }]} />

      <div className="min-w-0 overflow-x-auto rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
        <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
          <caption className="sr-only">each customer, the condition&apos;s answer for them, and whether WHERE keeps the row</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className="border-b border-line-2 px-2 pt-2 pb-1.5 @min-[520px]:px-3 font-normal text-hi">name</th>
              <th scope="col" className="border-b border-line-2 px-2 pt-2 pb-1.5 @min-[520px]:px-3 font-normal text-hi">city</th>
              <th scope="col" className="border-b border-line-2 px-2 pt-2 pb-1.5 @min-[520px]:px-3 font-normal text-faint">
                <span className="@min-[520px]:hidden">says</span>
                <span className="hidden @min-[520px]:inline">the condition says</span>
              </th>
              <th scope="col" className="hidden border-b border-line-2 px-2 pt-2 pb-1.5 @min-[520px]:px-3 font-normal text-faint @min-[520px]:table-cell">WHERE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const keep = r.v === "t";
              return (
                <tr key={r.i} className="transition-[background-color] duration-200 ease-sfe" style={{ background: keep ? tint("live", 7) : undefined }}>
                  <td className={`border-t border-line px-2 py-1.5 @min-[520px]:px-3 whitespace-nowrap ${keep ? "text-hi" : "text-mute"}`}>{r.who.name}</td>
                  <td className="border-t border-line px-2 py-1.5 @min-[520px]:px-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span className={r.city === null ? "text-faint italic" : r.city === "" ? "text-faint" : keep ? "text-ink" : "text-mute"}>{shown(r.city)}</span>
                      {r.who.city !== null && (
                        <button
                          type="button"
                          className="rounded-xs px-1 text-[10.5px] leading-4 text-faint shadow-[inset_0_0_0_1px_var(--line-2)] transition-colors duration-150 hover:text-hi"
                          aria-pressed={nulled[r.i]}
                          aria-label={nulled[r.i] ? `give ${r.who.name} back the city ${shown(r.who.city)}` : `set ${r.who.name}'s city to NULL`}
                          onClick={() => setNulled((n) => n.map((x, j) => (j === r.i ? !x : x)))}
                        >
                          {nulled[r.i] ? "undo" : "→ null"}
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="border-t border-line px-2 py-1.5 @min-[520px]:px-3 whitespace-nowrap">
                    <VerdictChip v={r.v} />
                  </td>
                  <td className="hidden border-t border-line px-2 py-1.5 @min-[520px]:px-3 whitespace-nowrap @min-[520px]:table-cell">
                    {keep ? <span style={{ color: "var(--live)" }}>kept</span> : <span className="text-faint line-through">dropped</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center" aria-live="polite">
        {[
          [`WHERE ${neg ? "NOT p" : "p"}`, kept, "live"],
          [`WHERE ${neg ? "p" : "NOT p"}`, keptOther, null],
          ["in neither", neither, null],
        ].map(([k, v, tone]) => (
          <div key={String(k)} className="rounded-md bg-well px-2 py-2 shadow-[inset_0_0_0_1px_var(--line)]" style={k === "in neither" && Number(v) > 0 ? { outline: "1px dashed var(--faint)", outlineOffset: -1, boxShadow: "none" } : undefined}>
            <div className="text-11 text-faint">{k}</div>
            <div className="text-16 tabular" style={{ color: tone ? "var(--live)" : "var(--hi)" }}>
              {v} of {rows.length}
            </div>
          </div>
        ))}
      </div>

      <Narration minLines={3}>
        {p.note}{" "}
        {neither > 0
          ? `${neither === 1 ? "one row is" : `${neither} rows are`} in neither result: the condition is unknown there, NOT unknown is unknown too, and WHERE only keeps true.`
          : "every row lands in exactly one of WHERE p and WHERE NOT p, because nothing came out unknown."}
      </Narration>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Legend
          items={[
            ["live", "true: kept"],
            ["mute", "false: dropped", "ghost"],
            ["faint", "unknown: dropped too", "dashed"],
          ]}
        />
        {trace && <Provenance trace={trace} />}
      </div>
    </div>
  );
}
