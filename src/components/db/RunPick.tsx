"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Narration, Provenance, ResultTable, SqlPanel, Words, type Cell, type Ink } from "@/components/figures/kit";
import { fromExplainJson } from "@/lib/db/fromTrace";
import { PlanDiagram } from "./PlanTree";

// flip an option, see the real result change. every combination of options is a captured run
// (a pgtrace step: its sql, its rows or its error, its note, optionally its plan), so nothing is
// computed here: the figure only picks which capture to show. a run's key is its option values
// joined with " | ". build the runs on the server with @/lib/db/captured, so only they ship:
//
//   import trace from "./traces/where-vs-on.pgtrace.json";
//   import { runsOf, planOf, prov } from "@/lib/db/captured";
//   export const runs = runsOf(trace, ["WHERE", "ON"], 1);
//   <RunPick options={[{ key: "filter in", values: ["WHERE", "ON"] }]} runs={runs} hot={["c.credits >= 4"]} trace={prov(trace)} />
//
// a run with `plan` (raw EXPLAIN FORMAT JSON, e.g. { ...resultOf(trace, 3), plan: planOf(trace, 4) })
// also draws its plan under the result; `ghost` strikes rows a variant removed. the table keeps
// one height across runs, so flipping an option doesn't make the page jump. (basics' RunSwitch
// is this same component under its old name.)

type Col = { name: string; type?: string };
export type PickRun = {
  sql: string;
  note?: ReactNode;
  columns: Col[];
  rows: (string | null)[][];
  error?: { sqlstate: string; message: string };
  /** a tint per row */
  tones?: (Ink | null)[];
  /** one tint for every row of this run (dead for the wrong answer, live for the right one); tones wins */
  tone?: Ink;
  /** substrings of the sql to light up, on top of the figure's own */
  hot?: string[];
  /** EXPLAIN (FORMAT JSON) for this run */
  plan?: unknown;
  /** rows to draw struck through (removed by this variant) */
  ghost?: number[];
};
type Opt = string | { v: string; label: string };
const val = (o: Opt) => (typeof o === "string" ? o : o.v);

/** every occurrence of each hot string, as whole words: "rank()" doesn't light the end of
 *  "dense_rank()". a mark that would overlap an earlier one is skipped */
function hotMarks(sql: string, hot: string[]): { from: number; to: number; tone: "hot" }[] {
  const out: { from: number; to: number; tone: "hot" }[] = [];
  const word = (c: string | undefined) => !!c && /[\w$]/.test(c);
  for (const h of hot) {
    if (!h) continue;
    for (let at = sql.indexOf(h); at >= 0; at = sql.indexOf(h, at + 1)) {
      const to = at + h.length;
      if ((word(h[0]) && word(sql[at - 1])) || (word(h[h.length - 1]) && word(sql[to]))) continue;
      if (out.some((m) => at < m.to && to > m.from)) continue;
      out.push({ from: at, to, tone: "hot" });
    }
  }
  return out.sort((x, y) => x.from - y.from);
}

export function RunPick({
  options,
  runs,
  start,
  hot = [],
  maxRows = 12,
  group,
  file = "query.sql",
  tone,
  trace,
  show = ["actual", "est"],
  hide = [],
  footer,
}: {
  options: { key: string; values: Opt[] }[];
  runs: Record<string, PickRun>;
  start?: string[];
  hot?: string[];
  maxRows?: number;
  /** a column whose runs of equal values get alternating shades */
  group?: string;
  file?: string;
  /** tint every row of every run (live = the answer) unless the run has its own tones */
  tone?: Ink;
  /** a capture's provenance (prov(trace)), not the whole capture */
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
  /** what a run's plan shows */
  show?: ("est" | "actual" | "buffers" | "cost")[];
  /** columns not to draw */
  hide?: string[];
  /** a line under the table, per run key (default: the row count) */
  footer?: Record<string, ReactNode>;
}) {
  const [picked, setPicked] = useState<string[]>(() => options.map((o, i) => start?.[i] ?? val(o.values[0])));
  const key = picked.join(" | ");
  const run = runs[key];
  const kw = `${Math.max(...options.map((o) => o.key.length)) + 3}ch`;
  const marks = run
    ? hotMarks(run.sql, [...hot, ...(run.hot ?? [])])
    : [];
  const keep = run ? run.columns.map((c, j) => (hide.includes(c.name) ? -1 : j)).filter((j) => j >= 0) : [];
  const cols = keep.map((j) => run!.columns[j]);
  const rows: Cell[][] = run ? run.rows.map((r) => keep.map((j) => r[j])) : [];
  const whole = run?.tone ?? tone;
  const tones = run?.tones ?? (whole ? rows.map(() => whole) : undefined);
  // the tallest run sets the table's height, so switching doesn't move the page
  const tallest = Math.min(maxRows, Math.max(0, ...Object.values(runs).map((r) => r.rows.length)));
  const anyNote = Object.values(runs).some((r) => r.note);
  const plan = useMemo(() => (run?.plan ? fromExplainJson(run.plan) : null), [run]);
  const facets = useMemo(() => new Set(show), [show]);

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="switch an option and see the real result">
      <div className="grid">
        {options.map((o, i) => (
          <div
            key={o.key}
            className={`grid gap-x-3 gap-y-1 py-2 text-12 ${parseInt(kw) > 12 ? "grid-cols-[minmax(0,1fr)] @min-[520px]:grid-cols-[var(--kw)_minmax(0,1fr)]" : "grid-cols-[var(--kw)_minmax(0,1fr)]"} ${i < options.length - 1 ? "border-b border-line" : ""}`}
            style={{ ["--kw" as string]: kw }}
          >
            <span className="pt-0.5 text-faint">{o.key} =</span>
            <Words
              label={o.key}
              options={o.values.map((x) => (typeof x === "string" ? x : { v: x.v, label: x.label }))}
              value={picked[i]}
              onChange={(v) => setPicked((p) => p.map((x, j) => (j === i ? v : x)))}
            />
          </div>
        ))}
      </div>
      {run && <SqlPanel code={run.sql} marks={marks} file={file} wrap />}
      {run?.error ? (
        <div className="rounded-md px-3 py-2.5 text-12 leading-[1.6]" style={{ boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--dead) 55%, transparent)", background: "color-mix(in srgb, var(--dead) 6%, transparent)" }} role="status">
          <span className="text-dead">ERROR:</span> <span className="text-ink">{run.error.message}</span>
          <span className="ml-2 text-11 text-faint">SQLSTATE {run.error.sqlstate}</span>
        </div>
      ) : run ? (
        <div style={{ minHeight: `${tallest * 26 + 70}px` }}>
          <ResultTable key={key} columns={cols} rows={rows} ghostRows={run.ghost} rowTones={tones} group={group} maxRows={maxRows} dense caption={`the result for ${key}`} footer={footer?.[key] ?? "auto"} />
        </div>
      ) : (
        <Narration>no capture for {key}.</Narration>
      )}
      {plan && (
        <div className="min-w-0 rounded-md bg-well px-2 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
          <div className="mb-2 px-1 font-mono text-11 text-faint">the plan</div>
          <PlanDiagram key={key} plan={plan} show={facets} />
        </div>
      )}
      {anyNote ? <Narration minLines={2}>{run?.note}</Narration> : null}
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
