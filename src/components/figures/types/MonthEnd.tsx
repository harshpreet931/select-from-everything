"use client";

import { useState } from "react";
import { Narration, Provenance, SqlPanel, Words, ring, tint } from "@/components/figures/kit";

// the last days of a month, pushed forward by interval '1 month' twice, or by '2 months' once.
// three columns of dates with lines from each start to where it lands. every date is a captured
// result (start, plus_1, plus_1_plus_1, plus_2); the figure only draws the mapping. dates that
// several starts collapse onto are hot.

type Res = { rows: (string | null)[][] };
type Mode = "twice" | "once";

const ROW = 40;
const fmtDay = (d: string) => {
  const m = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][Number(d.slice(5, 7)) - 1];
  return `${m} ${Number(d.slice(8, 10))}`;
};

export function MonthEnd({
  res,
  sql,
  notes,
  trace,
}: {
  /** captured: start, plus_1, plus_1_plus_1, plus_2 */
  res: Res;
  /** the query for each mode */
  sql: Record<Mode, string>;
  notes: Record<Mode, string>;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [mode, setMode] = useState<Mode>("twice");
  const starts = res.rows.map((r) => r[0]!);
  const n = starts.length;
  const H = n * ROW;
  const mid = (vals: string[]) => {
    // one chip per distinct value, centred on the rows that land on it
    const out = new Map<string, number[]>();
    vals.forEach((v, i) => out.set(v, [...(out.get(v) ?? []), i]));
    return [...out.entries()].map(([v, is]) => ({ v, y: ((is[0] + is[is.length - 1]) / 2 + 0.5) * ROW, many: is.length > 1 }));
  };
  const col2 = mode === "twice" ? mid(res.rows.map((r) => r[1]!)) : [];
  const col3 = mid(res.rows.map((r) => (mode === "twice" ? r[2]! : r[3]!)));
  const yOf = (list: { v: string; y: number }[], v: string) => list.find((x) => x.v === v)!.y;
  const X = [16, 50, 84]; // column centres, in % of the width
  const half = 2; // lines start just inside a chip; chips are opaque, so they hide the ends

  const chip = (v: string, y: number, col: number, hot: boolean, key: string) => (
    <div
      key={key}
      className="absolute flex h-7 -translate-x-1/2 -translate-y-1/2 items-center rounded-xs px-2 text-12 whitespace-nowrap tabular transition-[top,box-shadow,background-color,color] duration-300 ease-sfe"
      style={{
        left: `${X[col]}%`,
        top: y,
        background: hot ? tint("hot", 12) : "var(--well)",
        boxShadow: hot ? ring("hot", 70) : ring("line-2"),
        color: hot ? "var(--hot)" : "var(--hi)",
      }}
    >
      {fmtDay(v)}
    </div>
  );

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="month ends moved by one month, twice, or two months at once">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line pb-2 text-12 @min-[520px]:grid-cols-[8ch_minmax(0,1fr)]">
        <span className="pt-0.5 text-faint">add =</span>
        <Words
          options={[
            { v: "twice" as Mode, label: "'1 month', twice" },
            { v: "once" as Mode, label: "'2 months', once" },
          ]}
          value={mode}
          onChange={setMode}
          label="what to add"
        />
      </div>
      <SqlPanel code={sql[mode]} file="month-end.sql" wrap />
      <div className="grid grid-cols-3 text-center text-11 text-faint">
        <span>start</span>
        <span>{mode === "twice" ? "+ 1 month" : ""}</span>
        <span>{mode === "twice" ? "+ 1 month again" : "+ 2 months"}</span>
      </div>
      <div className="relative w-full" style={{ height: H }} role="img" aria-label={`${starts.map(fmtDay).join(", ")} become ${col3.map((c) => fmtDay(c.v)).join(", ")}`}>
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
          {res.rows.map((r, i) => {
            const y0 = (i + 0.5) * ROW;
            if (mode === "twice") {
              const y1 = yOf(col2, r[1]!);
              const y2 = yOf(col3, r[2]!);
              return (
                <g key={i} stroke="var(--line-2)" strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke">
                  <line x1={X[0] + half} y1={y0} x2={X[1] - half} y2={y1} vectorEffect="non-scaling-stroke" />
                  {i === 0 && <line x1={X[1] + half} y1={y1} x2={X[2] - half} y2={y2} vectorEffect="non-scaling-stroke" />}
                </g>
              );
            }
            return <line key={i} x1={X[0] + half} y1={y0} x2={X[2] - half} y2={yOf(col3, r[3]!)} stroke="var(--line-2)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        {starts.map((v, i) => chip(v, (i + 0.5) * ROW, 0, false, `a${v}`))}
        {col2.map((c) => chip(c.v, c.y, 1, c.many, `b${c.v}`))}
        {col3.map((c) => chip(c.v, c.y, 2, c.many, `c${c.v}`))}
      </div>
      <Narration minLines={3}>{notes[mode]}</Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
