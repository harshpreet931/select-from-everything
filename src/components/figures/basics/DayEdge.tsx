"use client";

import { useState, type ReactNode } from "react";
import { Legend, Narration, Provenance, SqlPanel, Words, useWidth } from "@/components/figures/kit";

// the last day of a month on a time axis, every order a tick. BETWEEN '2026-01-01' AND
// '2026-01-31' stops at midnight at the start of the 31st, because a date compared with a
// timestamp means 00:00:00. the half-open range runs to midnight at the start of the 1st.
// the ticks are captured order timestamps; the counts in the panel are captured too.

export type EdgeCase = { label: string; sql: string; until: string; inclusive: boolean; count: string; note: ReactNode };

const t = (s: string) => Date.parse(s.replace(" ", "T").replace(/\+00$/, "Z"));

export function DayEdge({
  ticks,
  from,
  to,
  monthEnd,
  days,
  cases,
  trace,
}: {
  /** order timestamps, as postgres printed them (UTC) */
  ticks: string[];
  /** the window drawn */
  from: string;
  to: string;
  /** where the month really ends (exclusive) */
  monthEnd: string;
  /** day boundaries to label: [timestamp, label] */
  days: [string, string][];
  cases: EdgeCase[];
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [ci, setCi] = useState(0);
  const c = cases[ci];
  const [ref, w] = useWidth<HTMLDivElement>(640);
  const W = Math.max(300, w);
  const pad = 14;
  const x0 = t(from);
  const x1 = t(to);
  const x = (s: string | number) => pad + ((typeof s === "number" ? s : t(s)) - x0) / (x1 - x0) * (W - 2 * pad);
  const until = t(c.until);
  const end = t(monthEnd);
  const inside = (v: number) => (c.inclusive ? v <= until : v < until);
  const H = 116;
  const axis = 70;

  const kept = ticks.filter((s) => inside(t(s))).length;
  const missed = ticks.filter((s) => !inside(t(s)) && t(s) < end).length;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="a date range on a time axis">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line pb-2 text-12 @min-[520px]:grid-cols-[7ch_minmax(0,1fr)]">
        <span className="pt-0.5 text-faint">WHERE =</span>
        <Words options={cases.map((k, i) => ({ v: i, label: k.label }))} value={ci} onChange={setCi} label="the range" />
      </div>
      <SqlPanel code={c.sql} file="query.sql" nolines />
      <div ref={ref} className="min-w-0">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ticks.length} orders around the end of the month: ${kept} inside the range, ${missed} on the last day left out`} className="block">
          {/* the range bracket */}
          <rect x={pad} y={axis - 46} width={Math.max(0, Math.min(x(until), W - pad) - pad)} height={34} rx={3} fill="color-mix(in srgb, var(--live) 9%, transparent)" stroke="color-mix(in srgb, var(--live) 55%, transparent)" />
          <text
            x={Math.min(x(until), W - pad) - 6 < 130 ? pad : Math.min(x(until), W - pad) - 6}
            y={axis - 51}
            textAnchor={Math.min(x(until), W - pad) - 6 < 130 ? "start" : "end"}
            className="fill-[var(--live)] text-[10.5px]"
          >
            {c.inclusive ? "≤ " : "< "}
            {c.until.slice(0, 16)}
          </text>
          {/* where the month really ends */}
          <line x1={x(end)} x2={x(end)} y1={axis - 50} y2={axis + 22} stroke="var(--mute)" strokeDasharray="3 3" />
          {/* axis */}
          <line x1={pad} x2={W - pad} y1={axis} y2={axis} stroke="var(--line-2)" />
          {days.map(([d, label]) => (
            <g key={d}>
              <line x1={x(d)} x2={x(d)} y1={axis - 4} y2={axis + 4} stroke="var(--faint)" />
              <text x={x(d) + 3} y={axis + 18} className="fill-[var(--faint)] text-[10.5px]">
                {label}
              </text>
            </g>
          ))}
          {ticks.map((s) => {
            const v = t(s);
            const inn = inside(v);
            const miss = !inn && v < end;
            return (
              <line
                key={s}
                x1={x(v)}
                x2={x(v)}
                y1={axis - 38}
                y2={axis - 18}
                strokeWidth={2}
                strokeLinecap="round"
                stroke={inn ? "var(--live)" : miss ? "var(--dead)" : "var(--faint)"}
                opacity={inn || miss ? 1 : 0.6}
              />
            );
          })}
          <text x={x(end) + 120 > W ? x(end) - 4 : x(end) + 4} y={axis + 32} textAnchor={x(end) + 120 > W ? "end" : "start"} className="fill-[var(--mute)] text-[10.5px]">
            the month ends here
          </text>
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md bg-well px-2 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
          <div className="text-11 text-faint">orders in january, this way</div>
          <div className="text-16 text-hi tabular">{c.count}</div>
        </div>
        <div className="rounded-md bg-well px-2 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
          <div className="text-11 text-faint">january 31st orders left out</div>
          <div className="text-16 tabular" style={{ color: missed ? "var(--dead)" : "var(--hi)" }}>
            {missed}
          </div>
        </div>
      </div>
      <Narration minLines={2}>{c.note}</Narration>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Legend
          items={[
            ["live", "inside the range"],
            ["dead", "january, but left out"],
            ["faint", "february"],
          ]}
        />
        {trace && <Provenance trace={trace} />}
      </div>
    </div>
  );
}
