"use client";

import { useState, type ReactNode } from "react";
import { FIG_TABLE, Legend, Narration, Provenance, SqlPanel, Words, ring, tint } from "@/components/figures/kit";

// three counts over the same rows. count(*) counts rows, count(col) counts the non-NULL values
// in col, count(DISTINCT col) counts different non-NULL values. the rows and the three numbers
// are captured (one SELECT each); the marks beside each row (counted, skipped, already seen)
// just show which rows the captured number is made of.

type Col = { name: string; type?: string };
export type CountKind = {
  /** the aggregate as written, e.g. count(shipped_at) */
  sql: string;
  /** the column it looks at; none for count(*) */
  col?: string;
  distinct?: boolean;
  note: ReactNode;
};

export function CountKinds({
  table,
  kinds,
  totals,
  from,
  trace,
}: {
  table: { columns: Col[]; rows: (string | null)[][] };
  kinds: CountKind[];
  /** the captured result: one column per kind, in the same order */
  totals: (string | null)[];
  /** the FROM ... WHERE part of the query, for the sql panel */
  from: string;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [ki, setKi] = useState(0);
  const kind = kinds[ki];
  const j = kind.col ? table.columns.findIndex((c) => c.name === kind.col) : -1;
  const seen = new Set<string>();
  const marks = table.rows.map((r) => {
    if (j < 0) return "count" as const;
    const v = r[j];
    if (v === null) return "null" as const;
    if (kind.distinct) {
      if (seen.has(v)) return "seen" as const;
      seen.add(v);
    }
    return "count" as const;
  });
  const sql = `SELECT ${kind.sql}\n${from}`;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="what three kinds of count count">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line py-2 text-12 @min-[520px]:grid-cols-[7ch_minmax(0,1fr)]">
        <span className="pt-0.5 text-faint">count =</span>
        <Words options={kinds.map((k, i) => ({ v: i, label: k.sql }))} value={ki} onChange={setKi} label="which count" />
      </div>
      <SqlPanel code={sql} nolines file="query.sql" marks={[{ line: 1, from: 7, to: 7 + kind.sql.length, tone: "hot" }]} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @min-[560px]:grid-cols-[minmax(0,1fr)_9rem]">
        <div className="min-w-0 overflow-x-auto rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
          <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
            <caption className="sr-only">each row, and whether {kind.sql} counts it</caption>
            <thead>
              <tr>
                {table.columns.map((c, cj) => (
                  <th key={c.name} scope="col" className="border-b border-line-2 px-3 pt-2 pb-1.5 text-left font-normal whitespace-nowrap" style={{ color: cj === j ? "var(--hot)" : "var(--hi)" }}>
                    {c.name}
                  </th>
                ))}
                <th scope="col" className="border-b border-line-2 px-3 pt-2 pb-1.5 text-right font-normal text-faint">
                  counts?
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => {
                const m = marks[i];
                return (
                  <tr key={i}>
                    {r.map((v, cj) => (
                      <td
                        key={cj}
                        className={`border-t border-line px-3 py-[5px] whitespace-nowrap ${cj === 0 ? "text-right tabular" : ""}`}
                        style={cj === j ? { background: tint("hot", 6) } : undefined}
                      >
                        {v === null ? <span className="text-faint italic">null</span> : <span className={m === "seen" && cj === j ? "text-faint line-through" : "text-ink"}>{v}</span>}
                      </td>
                    ))}
                    <td className="border-t border-line px-3 py-[5px] text-right whitespace-nowrap">
                      {m === "count" ? (
                        <span className="inline-flex rounded-xs px-1.5 text-11 leading-[18px]" style={{ color: "var(--live)", background: tint("live", 10), boxShadow: ring("live", 55) }}>
                          +1
                        </span>
                      ) : m === "null" ? (
                        <span className="inline-flex rounded-xs px-1.5 text-11 leading-[18px] text-mute italic" style={{ outline: "1px dashed var(--faint)", outlineOffset: -1 }}>
                          skipped
                        </span>
                      ) : (
                        <span className="text-11 text-faint">seen</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-3 gap-2 @min-[560px]:grid-cols-1">
          {kinds.map((k, i) => (
            <button
              key={k.sql}
              type="button"
              onClick={() => setKi(i)}
              className="rounded-md bg-well px-2 py-2 text-center transition-[box-shadow] duration-150 ease-sfe"
              style={{ boxShadow: i === ki ? ring("hot") : ring("line") }}
              aria-pressed={i === ki}
            >
              <div className="truncate text-[10.5px] text-faint">{k.sql}</div>
              <div className="text-18 tabular" style={{ color: i === ki ? "var(--hot)" : "var(--hi)" }}>
                {totals[i]}
              </div>
            </button>
          ))}
        </div>
      </div>
      <Narration minLines={2}>{kind.note}</Narration>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Legend
          items={[
            ["live", "counted"],
            ["faint", "NULL: skipped", "dashed"],
          ]}
        />
        {trace && <Provenance trace={trace} />}
      </div>
    </div>
  );
}
