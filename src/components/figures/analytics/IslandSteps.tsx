"use client";

import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, ResultTable, SqlPanel, ring, useReducedMotion, type Cell } from "@/components/figures/kit";

// the row_number subtraction trick, one move at a time. a strip of calendar days on top (active
// days solid, days with no row dashed: not there), the rows under it. step 1 numbers the rows,
// step 2 subtracts, and every island's cells show the same difference; step 3 groups by it.
// every value is captured: the calendar (generate_series left join), the rows with rn and the
// difference, and the grouped islands. the steps only choose which columns to show.

type Col = { name: string; type?: string };
type Res = { columns: Col[]; rows: (string | null)[][] };

const dd = (d: string | null) => (d ? d.slice(8, 10) : "");
const md = (d: string | null) => (d ? d.slice(5, 10) : "");

export function IslandSteps({
  sql,
  calendar,
  rows,
  islands,
  notes,
  trace,
}: {
  sql: string;
  /** every day in the range: (day, active) */
  calendar: (string | null)[][];
  /** the active days: day, rn, grp */
  rows: Res;
  /** one row per island: first, last, days */
  islands: Res;
  /** one sentence per step (4) */
  notes: string[];
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const s = useStepper(4, { interval: 2400 });
  const reduce = useReducedMotion();
  const k = s.i;
  const byDay = new Map(rows.rows.map((r) => [r[0], r]));
  // island index per active day, by its grp value, in order
  const grps = [...new Set(rows.rows.map((r) => r[2]))];
  const islandOf = (day: string | null) => {
    const r = byDay.get(day);
    return r ? grps.indexOf(r[2]) : -1;
  };
  const cols = k === 0 ? 1 : k === 1 ? 2 : 3;
  const table: Cell[][] = rows.rows.map((r) => r.slice(0, cols).map((v, j) => (j === 2 && k >= 2 ? { v, tone: "hot" as const } : v)));
  const marks = (() => {
    const out: { from: number; to: number; tone: "hot" }[] = [];
    const find = (h: string) => {
      const at = sql.indexOf(h);
      if (at >= 0) out.push({ from: at, to: at + h.length, tone: "hot" });
    };
    if (k === 1) find("row_number() OVER (ORDER BY day)");
    if (k === 2) find("day - row_number() OVER (ORDER BY day)");
    if (k === 3) find("GROUP BY grp");
    return out;
  })();

  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" aria-label="gaps and islands, step by step">
      <SqlPanel code={sql} file="islands.sql" marks={marks} right={`step ${k + 1}`} />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.3rem,1fr))] gap-1" role="img" aria-label="the calendar: active days and days with no row">
        {calendar.map(([day, active], i) => {
          const on = active === "t";
          const isl = islandOf(day);
          const r = byDay.get(day);
          const shade = k >= 2 && on ? (isl % 2 ? "var(--bg)" : "var(--well-2)") : undefined;
          return (
            <div
              key={i}
              className="flex min-w-0 flex-col items-center rounded-xs py-1 text-center transition-[background-color,box-shadow] duration-200 ease-sfe"
              style={{
                background: on ? (shade ?? "var(--well)") : undefined,
                boxShadow: on ? ring(k >= 2 ? "line-2" : "line") : undefined,
                outline: on ? undefined : "1px dashed var(--line-2)",
                outlineOffset: -1,
              }}
              title={day ?? ""}
            >
              <span className={`text-12 tabular ${on ? "text-hi" : "text-faint"}`}>{dd(day)}</span>
              <span className="text-[10px] leading-4 text-faint tabular">{on && k >= 1 ? `rn ${r?.[1]}` : " "}</span>
              <span className="text-[10px] leading-4 tabular" style={{ color: "var(--hot)" }}>
                {on && k >= 2 ? md(r?.[2] ?? null) : " "}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @min-[620px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ResultTable key={reduce ? "t" : `t${k}`} columns={rows.columns.slice(0, cols)} rows={table} group={k >= 2 ? 2 : undefined} dense caption="the active days" />
        {k === 3 ? (
          <ResultTable key="i" columns={islands.columns} rows={islands.rows} rowTones={islands.rows.map(() => "live")} dense caption="one row per island" />
        ) : (
          <div className="hidden rounded-md px-3 py-2 text-11 text-faint @min-[620px]:block" style={{ outline: "1px dashed var(--line-2)", outlineOffset: -1 }}>
            the islands appear here at step 4
          </div>
        )}
      </div>

      <Narration minLines={2}>{notes[k]}</Narration>
      <StepControls s={s} compact={reduce} />
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
