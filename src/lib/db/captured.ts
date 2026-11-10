// readers for pgtrace captures, for mdx (server side): pull one step's result, a run of steps,
// a plan or a @stages step out of a capture, so a client figure is handed only that slice and
// the page doesn't ship the whole json. pure, no react, no "use client".
//
//   import trace from "./traces/on-grid.pgtrace.json";
//   import { resultOf, runsOf, planOf, prov } from "@/lib/db/captured";
//   export const runs = runsOf(trace, ["= | inner", "true | inner"], 2);   → <RunPick runs={runs} trace={prov(trace)} />
//   export const plan = planOf(trace, 5);                                  → <PlanTree plan={plan} />
//   export const n = valueOf(trace, 1);                                    → "there are {n} of them"

/** the parts of a capture these readers use (a PgTrace fits; so does an imported .pgtrace.json) */
export type CaptureStep = {
  sql: string;
  note?: string;
  status?: string;
  result?: { columns: { name: string; type: string }[]; data: (string | null)[][] };
  error?: { sqlstate: string; message: string; detail?: string };
  explain?: unknown;
  stages?: { clause: string; columns: string[]; types?: string[]; data: (string | null)[][]; note?: string; sql?: string; group?: string }[];
};
export type Capture = { steps: CaptureStep[]; engine?: { version?: string; build?: string }; scenario?: string };

export type Captured = {
  sql: string;
  note?: string;
  columns: { name: string; type: string }[];
  rows: (string | null)[][];
  error?: { sqlstate: string; message: string };
};

/** columns stay names (figures index them); types, parallel, when the capture recorded them */
export type CapturedStage = { clause: string; columns: string[]; types?: string[]; rows: (string | null)[][]; note?: string; sql?: string; group?: string };

/** a step's sql, tidied: comment lines dropped, one trailing semicolon */
export function sqlOf(step: CaptureStep): string {
  const q = step.sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .trim();
  return q.endsWith(";") ? q : `${q};`;
}

/** step i's sql, note and result (or error) */
export function resultOf(trace: Capture, i: number): Captured {
  const st = trace.steps[i];
  if (!st) throw new Error(`no step ${i} in ${trace.scenario}`);
  return {
    sql: sqlOf(st),
    ...(st.note ? { note: st.note } : {}),
    columns: st.result?.columns ?? [],
    rows: st.result?.data ?? [],
    ...(st.error ? { error: { sqlstate: st.error.sqlstate, message: st.error.message } } : {}),
  };
}

/** steps from .. from + keys.length - 1 as a map, key → captured result (keys: option values joined with " | ") */
export function runsOf(trace: Capture, keys: string[], from: number): Record<string, Captured> {
  return Object.fromEntries(keys.map((k, j) => [k, resultOf(trace, from + j)]));
}

/** the single value of a one-row, one-column result (a count, usually) */
export function valueOf(trace: Capture, i: number): string {
  const v = trace.steps[i]?.result?.data?.[0]?.[0];
  if (v === undefined || v === null) throw new Error(`step ${i} in ${trace.scenario} has no single value`);
  return v;
}

/** step i's EXPLAIN (FORMAT JSON), for <PlanTree plan={…} /> or a RunPick run's plan */
export function planOf(trace: Capture, i: number): unknown {
  const p = trace.steps[i]?.explain;
  if (!p) throw new Error(`step ${i} in ${trace.scenario} has no plan`);
  return p;
}

/** step i's @stages, in the shape <ClauseStepper stages> takes, plus the query they belong to */
export function stagesOf(trace: Capture, i: number): { sql: string; stages: CapturedStage[] } {
  const st = trace.steps[i];
  if (!st?.stages?.length) throw new Error(`step ${i} in ${trace.scenario} has no @stages`);
  return {
    sql: sqlOf(st),
    stages: st.stages.map((s) => ({
      clause: s.clause,
      columns: s.columns,
      ...(s.types?.length === s.columns.length ? { types: s.types } : {}),
      rows: s.data,
      ...(s.note ? { note: s.note } : {}),
      ...(s.sql ? { sql: s.sql } : {}),
      ...(s.group ? { group: s.group } : {}),
    })),
  };
}

/** just what a <Provenance trace={…} /> line needs, so a client figure isn't handed the whole capture */
export function prov(trace: Capture): { engine?: { version?: string; build?: string }; scenario?: string } {
  return { engine: { version: trace.engine?.version, build: trace.engine?.build }, scenario: trace.scenario };
}
