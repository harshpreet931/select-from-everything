"use client";

import { useState } from "react";
import { Narration, Provenance, SqlPanel, Words, ring, tint } from "@/components/figures/kit";

// a month as a calendar grid, filled from two captured results: GROUP BY over the events alone
// (a row only for days that have one) and a generate_series calendar LEFT JOINed to the events
// (a row for every day). switch between them: a day with no row is dashed, "not there"; the
// day the calendar added is hot.

type Res = { sql: string; note?: string; rows: (string | null)[][] };

const DOW = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function MonthGrid({
  sparse,
  full,
  unit = "",
  trace,
}: {
  /** day, value: only the days that have rows */
  sparse: Res;
  /** day, isodow (1 = monday), value: every day */
  full: Res;
  unit?: string;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [mode, setMode] = useState<"events" | "calendar">("events");
  const have = new Map(sparse.rows.map((r) => [r[0], r[1]]));
  const run = mode === "events" ? sparse : full;
  const lead = Number(full.rows[0]?.[1] ?? 1) - 1;
  const added = full.rows.filter((r) => !have.has(r[0])).map((r) => r[0]);

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="a month of daily counts, with and without a calendar">
      <div className="grid grid-cols-[12ch_minmax(0,1fr)] items-center gap-x-3 text-12">
        <span className="text-faint">rows from =</span>
        <Words
          options={[
            { v: "events", label: "the events only" },
            { v: "calendar", label: "a calendar first" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as "events" | "calendar")}
          label="where the rows come from"
        />
      </div>
      <SqlPanel code={run.sql} file="per-day.sql" />
      <div className="mx-auto grid w-full max-w-[34rem] grid-cols-7 gap-1" role="img" aria-label={`${run.rows.length} rows for ${full.rows.length} days`}>
        {DOW.map((d) => (
          <div key={d} className="pb-1 text-center text-11 text-faint">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`b${i}`} />
        ))}
        {full.rows.map(([day, , v]) => {
          const missing = mode === "events" && !have.has(day);
          const isNew = mode === "calendar" && added.includes(day);
          const val = mode === "events" ? have.get(day) : v;
          return (
            <div
              key={day}
              className="flex aspect-[5/4] min-w-0 flex-col justify-between rounded-xs px-1.5 py-1 transition-[background-color,box-shadow] duration-200 ease-sfe"
              style={{
                background: missing ? undefined : isNew ? tint("hot", 12) : "var(--well)",
                boxShadow: missing ? undefined : isNew ? ring("hot", 70) : ring("line"),
                outline: missing ? "1px dashed var(--line-2)" : undefined,
                outlineOffset: -1,
              }}
              title={day ?? ""}
            >
              <span className="text-[10px] leading-3 text-faint tabular">{day?.slice(8)}</span>
              <span className={`text-right text-12 tabular ${missing ? "text-faint" : ""}`} style={{ color: isNew ? "var(--hot)" : undefined }}>
                {missing ? "" : val}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-center text-11 text-faint tabular">
        {run.rows.length} rows · {full.rows.length} days{unit ? ` · ${unit}` : ""}
      </div>
      <Narration minLines={2}>{run.note}</Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
