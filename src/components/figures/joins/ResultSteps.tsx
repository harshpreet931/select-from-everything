"use client";

import { Fragment } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, ResultTable, SqlPanel, Stat, fmt, ring, tint, useReducedMotion, type Cell } from "@/components/figures/kit";

// a few captured queries in a row, each one a step: its sql, its real result, and a total that
// is right (live) or wrong (dead). `group` shades runs of equal values in one column, which is
// how a fan-out shows itself: the same order id, again and again, once per line.
//
//   <ResultSteps steps={[{ label: "orders", run, group: "order_id", total: { k: "sum", v: "3033.13", ok: true } }]} trace={p} />

type Col = { name: string; type?: string };
type Step = {
  label: string;
  run: { sql: string; note?: string; columns: Col[]; rows: (string | null)[][] };
  group?: string;
  hot?: string[];
  total?: { k: string; v: string; ok: boolean };
  maxRows?: number;
};

export function ResultSteps({ steps, trace }: { steps: Step[]; trace?: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const reduce = useReducedMotion();
  const s = useStepper(steps.length, { interval: 2600 });
  const st = steps[s.i];
  const marks = (st.hot ?? []).flatMap((h) => {
    const at = st.run.sql.indexOf(h);
    return at >= 0 ? [{ from: at, to: at + h.length, tone: "hot" as const }] : [];
  });
  const tallest = Math.max(...steps.map((x) => Math.min(x.run.rows.length, x.maxRows ?? 20) + (x.run.rows.length > (x.maxRows ?? 20) ? 1 : 0)));
  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" aria-label="a few queries in a row, with their real results">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-11" aria-label="steps">
        {steps.map((x, i) => (
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
                <span className="text-[10px] leading-3 text-faint tabular">
                  {fmt(x.run.rows.length)} row{x.run.rows.length === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          </Fragment>
        ))}
      </ol>
      <SqlPanel code={st.run.sql} marks={marks} file="query.sql" wrap />
      <div style={{ minHeight: `${tallest * 25 + 62}px` }}>
        <ResultTable key={reduce ? "r" : s.i} columns={st.run.columns} rows={st.run.rows as Cell[][]} group={st.group} maxRows={st.maxRows ?? 20} dense />
      </div>
      {st.total && (
        <div className="flex items-end gap-4">
          <Stat k={st.total.k} v={st.total.v} tone={st.total.ok ? "live" : "dead"} />
          <div className="pb-0.5 text-12" style={{ color: st.total.ok ? "var(--live)" : "var(--dead)" }}>
            {st.total.ok ? "right." : "wrong."}
          </div>
        </div>
      )}
      <Narration minLines={2}>{st.run.note}</Narration>
      <StepControls s={s} label="query" compact={reduce} />
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
