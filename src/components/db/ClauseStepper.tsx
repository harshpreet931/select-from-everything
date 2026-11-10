import type { ReactNode } from "react";
import { fmt } from "@/components/figures/kit/format";
import { provenanceText } from "@/components/figures/kit/Provenance";
import type { PgTrace } from "@/lib/db/pgtrace";
import type { Table } from "@/lib/db/views";
import { traceStages, traceStagesSql } from "@/lib/db/fromTrace";
import { ClauseStepperView, type Stage } from "./ClauseStepperView";

// the logical order of a query, one clause at a time (the drawing is ClauseStepperView).
// this half has no "use client": from mdx it runs on the server, reads the capture there, and
// hands the browser only the stages (rows + notes + prefix queries) and the provenance line.
// so pass the whole capture, the browser never gets it twice:
//
//   import trace from "./traces/logical-order.pgtrace.json";
//   <ClauseStepper trace={trace} maxRows={14} />                 sql, stages, notes, provenance: all from the capture
//   <ClauseStepper trace={trace} step={1} />                      the @stages of step 1, when a capture has more than one
//
// hand-written stages (textbook, "the standard says"):
//
//   <ClauseStepper sql={q} stages={[{ clause: "FROM", columns, rows, note }, ...]} provenance="drawn by hand" />
//
// sql defaults to the capture's @stages query. provenance defaults to the capture's line
// ("real output, postgres 18.6 (PGlite 0.5.12) · logical-order"); pass a string or an element
// to override it. `source` is the old name for a provenance string and still works.

export type { Stage };

export function ClauseStepper({
  sql,
  stages: given,
  tables,
  trace,
  step,
  maxRows = 10,
  start = 0,
  provenance,
  source,
}: {
  sql?: string;
  stages?: Stage[];
  /** source tables; used for the FROM stage when stages don't start with one */
  tables?: Record<string, Table>;
  /** a pgtrace capture with an @stages step (or just { engine, scenario } for the provenance line) */
  trace?: Pick<PgTrace, "engine" | "scenario"> & { steps?: PgTrace["steps"] };
  /** which step's @stages to show (default: the first step that has stages) */
  step?: number;
  maxRows?: number;
  start?: number;
  provenance?: ReactNode;
  /** @deprecated use provenance */
  source?: string;
}) {
  const full = trace?.steps?.length ? (trace as PgTrace) : undefined;
  // string columns + types (stagesOf) → typed columns, so headers read like ResultTable's
  let stages: Stage[] = (given ?? (full ? (traceStages(full, step) as Stage[]) : [])).map((s) =>
    s.types?.length === s.columns.length ? { ...s, columns: s.columns.map((c, j) => (typeof c === "string" ? { name: c, type: s.types![j] } : c)) } : s,
  );
  if (stages[0]?.clause !== "FROM" && tables) {
    const [name, t] = Object.entries(tables)[0] ?? [];
    if (t) stages = [{ clause: "FROM", columns: t.columns, rows: t.rows, note: `FROM ${name}: ${fmt(t.rows.length)} rows.` }, ...stages];
  }
  const query = sql ?? (full ? traceStagesSql(full, step) : undefined) ?? "";
  const prov = provenance ?? source ?? (trace?.engine ? provenanceText(trace) : undefined);
  if (!stages.length) return null;
  return <ClauseStepperView sql={query} stages={stages} maxRows={maxRows} start={start} provenance={prov} />;
}
