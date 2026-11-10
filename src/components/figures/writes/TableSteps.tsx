"use client";

import { Fragment } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, Provenance, ResultTable, SqlPanel, fmt, ring, tint, useReducedMotion, type Cell, type LegendItem } from "@/components/figures/kit";
import type { Frame } from "./frames";

// a table, one statement at a time. each step is a captured statement (its sql, its command tag
// or its error, what it RETURNed) and the table right after it: new rows live, changed cells hot,
// rows that went away struck through for one step. frames come from framesOf() in ./frames,
// read on the server, so only the frames ship.

export function TableSteps({
  frames,
  table,
  trace,
  maxRows = 14,
  file = "query.sql",
  start = 0,
}: {
  frames: Frame[];
  /** what the table under the statement is: "teas", "customers 1 to 8 and 42" */
  table: string;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
  maxRows?: number;
  file?: string;
  start?: number;
}) {
  const reduce = useReducedMotion();
  const s = useStepper(frames.length, { interval: 2400, start });
  const f = frames[s.i];
  // the tallest frame sets the height, so stepping doesn't move the page
  const tallest = Math.max(...frames.map((x) => Math.min(x.rows.length, maxRows) + (x.rows.length > maxRows ? 1 : 0)));
  const outTallest = Math.max(0, ...frames.map((x) => (x.out ? Math.min(x.out.rows.length, 6) + 2 : 0)));
  const sqlLines = Math.max(...frames.map((x) => (x.sql ?? "").split("\n").length));
  const legend: LegendItem[] = [];
  if (frames.some((x) => x.rowTones.includes("live"))) legend.push(["live", "new row"]);
  if (frames.some((x) => x.rows.some((r) => r.some((c) => c !== null && typeof c === "object" && c.tone === "hot")))) legend.push(["hot", "changed"]);
  if (frames.some((x) => x.ghost.length)) legend.push(["dead", "gone", "ghost"]);
  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" aria-label="a table, one statement at a time">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-11" aria-label="steps">
        {frames.map((x, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <li aria-hidden className="text-faint">
                →
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={() => s.go(i)}
                aria-current={i === s.i ? "step" : undefined}
                className="flex flex-col items-center rounded-xs px-1.5 py-0.5 transition-[box-shadow,background-color,color] duration-200 ease-sfe"
                style={{
                  boxShadow: i === s.i ? ring("hot") : ring("line"),
                  background: i === s.i ? tint("hot", 8) : undefined,
                  color: i === s.i ? "var(--hot)" : i < s.i ? "var(--ink)" : "var(--faint)",
                }}
              >
                <span className="leading-[18px] whitespace-nowrap">{x.label}</span>
                <span className="text-[10px] leading-3 tabular" style={{ color: x.error ? "var(--dead)" : "var(--faint)" }}>
                  {x.error ? `ERROR ${x.error.sqlstate}` : x.tag && x.tag !== x.label ? x.tag : "·"}
                </span>
              </button>
            </li>
          </Fragment>
        ))}
      </ol>
      <div style={{ minHeight: `${sqlLines * 1.75 + 1.4}em` }}>
        {f.sql ? (
          <SqlPanel code={f.sql} file={file} right={f.error ? undefined : f.tag} wrap />
        ) : (
          <div className="rounded-md px-3 py-2.5 text-12 text-faint shadow-[inset_0_0_0_1px_var(--line)]">before anything runs</div>
        )}
      </div>
      {f.error && (
        <div
          className="rounded-md px-3 py-2.5 text-12 leading-[1.6]"
          style={{ boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--dead) 55%, transparent)", background: "color-mix(in srgb, var(--dead) 6%, transparent)" }}
          role="status"
        >
          <span className="text-dead">ERROR:</span> <span className="text-ink">{f.error.message}</span>
          <span className="ml-2 text-11 text-faint">SQLSTATE {f.error.sqlstate}</span>
        </div>
      )}
      {outTallest > 0 && (
        <div style={{ minHeight: `${outTallest * 26}px` }}>
          {f.out && (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <div className="text-11 text-faint">RETURNING gave back</div>
              <ResultTable key={`o${s.i}`} columns={f.out.columns} rows={f.out.rows} dense maxRows={6} />
            </div>
          )}
        </div>
      )}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-11 text-faint">
          <span>
            {table}, after this step
          </span>
          {f.total && <span className="tabular">the whole table: {fmt(Number(f.total))} rows</span>}
        </div>
        <div style={{ minHeight: `${tallest * 25 + 62}px` }}>
          <ResultTable
            key={reduce ? "t" : s.i}
            columns={f.columns}
            rows={f.rows as Cell[][]}
            rowTones={f.rowTones}
            ghostRows={f.ghost}
            maxRows={maxRows}
            focusRows={f.ghost}
            dense
            caption={`${table} after: ${f.label}`}
          />
        </div>
        <Legend items={legend} />
      </div>
      <Narration minLines={2}>{f.note}</Narration>
      <StepControls s={s} compact={reduce} />
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
