"use client";

import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, ResultTable, SqlPanel, Well, useReducedMotion, type Cell, type Ink } from "@/components/figures/kit";

// a recursive CTE, one iteration at a time. the anchor fills the working table; every
// iteration runs the recursive half against the working table only, appends what it found to
// the result, and that becomes the next working table. the loop ends on the first iteration
// that finds nothing.
//
// the tables are pgtrace @stages: each stage is the whole recursive query, really run, filtered
// to one depth. postgres doesn't expose its working table from outside, but here depth goes up
// by exactly one per iteration, so "the rows at depth n" is exactly iteration n's working table.

type Stage = { clause: string; columns: string[]; rows: (string | null)[][]; note?: string };

/** [from, to) of the anchor and of the recursive member, in the query text */
function halves(sql: string) {
  const open = sql.search(/\bAS\s*\(/i);
  const union = sql.search(/\bUNION(\s+ALL)?\b/i);
  const unionLen = /\bUNION(\s+ALL)?\b/i.exec(sql)?.[0].length ?? 0;
  const close = sql.search(/\)\s*\n\s*(SEARCH|CYCLE|SELECT)\b/i);
  if (open < 0 || union < 0 || close < 0) return null;
  const a = sql.indexOf("SELECT", open);
  const r = sql.indexOf("SELECT", union);
  return { anchor: [a, union] as const, union: [union, union + unionLen] as const, rec: [r, close] as const };
}

export function RecursiveSteps({
  sql,
  stages,
  hide = [],
  trace,
}: {
  sql: string;
  stages: Stage[];
  /** columns not to draw */
  hide?: string[];
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const s = useStepper(stages.length, { interval: 2200 });
  const reduce = useReducedMotion();
  const k = Math.min(s.i, stages.length - 1);
  const st = stages[k];
  const keep = st.columns.map((c, j) => (hide.includes(c) ? -1 : j)).filter((j) => j >= 0);
  const cols = keep.map((j) => st.columns[j]);
  const pick = (r: (string | null)[]) => keep.map((j) => r[j]);
  const h = halves(sql);
  const marks = h ? [{ from: (k === 0 ? h.anchor : h.rec)[0], to: (k === 0 ? h.anchor : h.rec)[1], tone: "hot" as const }] : [];
  const empty = st.rows.length === 0;

  // the result so far: every stage up to this one, this one's rows hot
  const result: Cell[][] = [];
  const tones: (Ink | null)[] = [];
  stages.slice(0, k + 1).forEach((x, i) =>
    x.rows.forEach((r) => {
      result.push(pick(r));
      tones.push(i === k ? "hot" : null);
    }),
  );
  const total = stages.reduce((n, x) => n + x.rows.length, 0);

  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" aria-label="a recursive query, one iteration at a time">
      <SqlPanel code={sql} file="team.sql" marks={marks} right={k === 0 ? "the anchor" : `iteration ${k}`} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @min-[680px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Well label={k === 0 ? "working table: what the anchor found" : `working table: what iteration ${k} found`} right={`${st.rows.length} ${st.rows.length === 1 ? "row" : "rows"}`} tone={empty ? undefined : "hot"} dashed={empty}>
          <div className="p-2">
            {empty ? (
              <div className="px-2 py-3 text-12 text-faint">
                empty. nothing to feed the next iteration: <span className="text-hi">the recursion stops here.</span>
              </div>
            ) : (
              <ResultTable key={reduce ? "w" : `w${k}`} columns={cols} rows={st.rows.map(pick)} rowTones={st.rows.map(() => "hot")} dense footer="none" caption="the working table" />
            )}
          </div>
        </Well>
        <Well label="the result so far" right={`${result.length} of ${total}`}>
          <div className="p-2">
            <ResultTable columns={cols} rows={result} rowTones={tones} dense maxRows={14} footer="none" caption="the result so far" />
          </div>
        </Well>
      </div>

      <Narration minLines={2}>{st.note}</Narration>
      <StepControls s={s} label="step" compact={reduce} />
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
