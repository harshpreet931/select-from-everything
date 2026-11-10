"use client";

import { useState } from "react";
import { FIG_TABLE, Narration, Provenance, ResultTable, Row, SqlPanel, Stat, Words, ring, tint } from "@/components/figures/kit";

// the join as a grid: every left row against every right row, and the ON as a filter over the
// cells. the reader picks the ON (and INNER or LEFT); the ticks, the padded rows and the result
// are looked up in captured runs (one real query per ON and kind), never evaluated here. a
// result row is placed in the grid by its key columns, which are unique on each side.
//
//   <OnGrid left={l} right={r} at={[0, 3]} ons={[{ v: "=", label: "s.city = c.city" }]} kinds={["inner", "left"]} runs={runs} trace={p} />

type Col = { name: string; type?: string };
type Run = { sql: string; note?: string; columns: Col[]; rows: (string | null)[][] };
type Side = { name: string; columns: Col[]; rows: (string | null)[][]; key: number; label?: number[] };

export function OnGrid({
  left,
  right,
  at,
  ons,
  kinds = ["inner"],
  runs,
  start,
  full,
  result = true,
  hotOn = true,
  trace,
}: {
  left: Side;
  right: Side;
  /** which columns of a run's rows hold the left key and the right key */
  at: [number, number];
  ons: { v: string; label: string }[];
  kinds?: string[];
  /** `${on} | ${kind}` → the captured run */
  runs: Record<string, Run>;
  start?: [string, string];
  /** tint left rows that matched every right row (relational division) */
  full?: boolean;
  /** draw the result table under the grid */
  result?: boolean;
  /** light up the ON condition in the query */
  hotOn?: boolean;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [on, setOn] = useState(start?.[0] ?? ons[0].v);
  const [kind, setKind] = useState(start?.[1] ?? kinds[0]);
  const run = runs[`${on} | ${kind}`];
  const label = (s: Side, r: (string | null)[]) => (s.label ?? [s.key]).map((j) => r[j] ?? "NULL").join(" ");

  const li = new Map(left.rows.map((r, i) => [r[left.key], i]));
  const ri = new Map(right.rows.map((r, j) => [r[right.key], j]));
  const match = left.rows.map(() => right.rows.map(() => false));
  const padded = new Set<number>();
  for (const r of run?.rows ?? []) {
    const i = r[at[0]] === null ? undefined : li.get(r[at[0]]);
    const j = r[at[1]] === null ? undefined : ri.get(r[at[1]]);
    if (i !== undefined && j !== undefined) match[i][j] = true;
    else if (i !== undefined) padded.add(i);
  }
  const pairs = match.flat().filter(Boolean).length;
  const whole = (i: number) => full && right.rows.length > 0 && match[i].every(Boolean);
  const onText = ons.find((o) => o.v === on)?.label ?? on;
  const sql = run?.sql ?? "";
  const at0 = hotOn ? sql.indexOf(onText) : -1;
  const marks = at0 >= 0 ? [{ from: at0, to: at0 + onText.length, tone: "hot" as const }] : [];

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="a join drawn as a grid of every pair of rows">
      <div>
        {ons.length > 1 && (
          <Row k="ON =" w="7ch" last={kinds.length < 2} align="baseline">
            <Words label="join condition" options={ons.map((o) => ({ v: o.v, label: o.label }))} value={on} onChange={setOn} />
          </Row>
        )}
        {kinds.length > 1 && (
          <Row k="join =" w="7ch" last>
            <Words label="join type" options={kinds} value={kind} onChange={setKind} />
          </Row>
        )}
      </div>

      {sql && <SqlPanel code={sql} marks={marks} file="query.sql" wrap />}

      <div className="min-w-0 overflow-x-auto">
        <table
          className={`mx-auto w-auto border-collapse text-11 @min-[520px]:text-12 ${FIG_TABLE}`}
          aria-label={`${left.rows.length} ${left.name} rows against ${right.rows.length} ${right.name} rows: ${pairs} of ${left.rows.length * right.rows.length} pairs pass ON`}
        >
          <thead>
            <tr>
              <th className="border-0 px-2 py-1 text-left font-normal text-faint">
                {left.name} ↓ {right.name} →
              </th>
              {right.rows.map((r, j) => (
                <th key={j} className="border-0 px-1.5 py-1 font-normal whitespace-nowrap text-mute">
                  {label(right, r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {left.rows.map((r, i) => {
              const pad = padded.has(i);
              const all = whole(i);
              return (
                <tr key={i}>
                  <th
                    className="border-0 px-2 py-1 text-left font-normal whitespace-nowrap transition-[box-shadow,color] duration-200 ease-sfe"
                    style={{ color: pad || all ? "var(--hi)" : "var(--mute)", boxShadow: pad ? "inset 2px 0 0 var(--ref)" : all ? "inset 2px 0 0 var(--live)" : undefined }}
                  >
                    {label(left, r)}
                    {pad && <span className="ml-1.5 text-[10px] text-ref">padded</span>}
                  </th>
                  {right.rows.map((_, j) => {
                    const m = match[i][j];
                    return (
                      <td key={j} className="p-0.5 text-center">
                        <span
                          className="inline-flex size-6 items-center justify-center rounded-xs transition-[background-color,box-shadow] duration-200 ease-sfe"
                          style={{ background: m ? tint("live", 22) : undefined, boxShadow: m ? ring("live", 70) : ring("line") }}
                          aria-label={m ? "pair kept" : "pair dropped"}
                        >
                          {m ? <span className="text-live">✓</span> : <span className="text-faint">·</span>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat k="pairs" v={left.rows.length * right.rows.length} />
        <Stat k="pass ON" v={pairs} tone="live" />
        {(full || kinds.some((k) => k !== "inner")) && (
          <Stat k={full ? "matched all" : "padded"} v={full ? left.rows.filter((_, i) => whole(i)).length : padded.size} tone={full ? "live" : padded.size ? "ref" : undefined} />
        )}
      </div>

      {result && run && (
        <ResultTable
          columns={run.columns}
          rows={run.rows}
          rowTones={run.rows.map((r) => (r[at[0]] !== null && r[at[1]] !== null ? "live" : undefined))}
          dense
          maxRows={8}
          caption={`${kind} join result`}
        />
      )}
      <Narration minLines={2}>{run?.note}</Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
