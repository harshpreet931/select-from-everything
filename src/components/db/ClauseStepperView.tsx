"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, ResultTable, Sql, SqlPanel, clauseRanges, distinctOnKey, distinctRange, fmt, foldGaps, foldRows, ring, tint, useReducedMotion, type Cell, type Column } from "@/components/figures/kit";

// the client half of <ClauseStepper> (ClauseStepper.tsx is the part mdx uses): it gets only
// the stages and a provenance line, never a whole capture.
//
// the logical order of a query, one clause at a time. every clause takes a table and hands
// a table to the next. the active clause is hot in the sql; rows a clause removes stay on
// screen struck through for that step and are gone in the next; GROUP BY buckets alternate
// a neutral tint. stages are real prefix queries (pgtrace @stages), so the counts are real.

export type Stage = {
  clause: string;
  columns: Column[];
  rows: Cell[][];
  note?: ReactNode;
  /** the prefix query that produced this table (pgtrace @stages records it) */
  sql?: string;
  /** rows of the previous stage to draw struck through. default: the previous rows missing here,
   *  when this stage's rows all come from the previous one. [] draws this stage's own table */
  drop?: number[];
  group?: string | number;
  /** column types parallel to string columns (stagesOf passes them): drawn in the header like ResultTable */
  types?: string[];
};

const colName = (c: Column) => (typeof c === "string" ? c : c.name);
const keyOf = (r: Cell[]) => JSON.stringify(r.map((c) => (c !== null && typeof c === "object" ? c.v : c)).map((v) => (v === null ? null : String(v))));
const sameCols = (a: Column[], b: Column[]) => a.length === b.length && a.every((c, i) => colName(c) === colName(b[i]));

/** rows of prev that are not in cur (multiset difference), by index. null when cur has rows prev
 *  doesn't: then the clause made a new table (a recursive step, a set operation), it didn't filter */
function dropped(prev: Cell[][], cur: Cell[][]): number[] | null {
  const left = new Map<string, number>();
  for (const r of cur) left.set(keyOf(r), (left.get(keyOf(r)) ?? 0) + 1);
  const out: number[] = [];
  prev.forEach((r, i) => {
    const k = keyOf(r);
    const n = left.get(k) ?? 0;
    if (n > 0) left.set(k, n - 1);
    else out.push(i);
  });
  for (const n of left.values()) if (n > 0) return null;
  return out;
}

function groupKey(sql: string): string | undefined {
  const g = clauseRanges(sql).find((c) => c.clause === "GROUP BY");
  if (!g) return undefined;
  return sql
    .slice(g.from, g.to)
    .replace(/^GROUP\s+BY\s+/i, "")
    .split(",")[0]
    ?.trim()
    .replace(/^"|"$/g, "");
}

function aliases(sql: string): string[] {
  const s = clauseRanges(sql).find((c) => c.clause === "SELECT");
  if (!s) return [];
  return [...sql.slice(s.from, s.to).matchAll(/\bAS\s+("?)([A-Za-z_][\w]*)\1/gi)].map((m) => m[2]);
}

/** what step k draws: the previous table with this clause's removals struck, or the new table */
function display(stages: Stage[], k: number): { columns: Column[]; rows: Cell[][]; ghosts: number[] } {
  const st = stages[k];
  const prev = k > 0 ? stages[k - 1] : undefined;
  if (prev && sameCols(prev.columns, st.columns)) {
    const d = st.drop ?? dropped(prev.rows, st.rows) ?? [];
    if (d.length) return { columns: prev.columns, rows: prev.rows, ghosts: d };
  }
  return { columns: st.columns, rows: st.rows, ghosts: [] };
}

export function ClauseStepperView({
  sql,
  stages,
  maxRows = 10,
  start = 0,
  provenance,
}: {
  sql: string;
  stages: Stage[];
  maxRows?: number;
  start?: number;
  provenance?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const s = useStepper(Math.max(1, stages.length), { interval: 2200, start });
  const ranges = useMemo(() => clauseRanges(sql), [sql]);
  const gk = useMemo(() => groupKey(sql), [sql]);
  const dk = useMemo(() => distinctOnKey(sql), [sql]);
  const dr = useMemo(() => distinctRange(sql), [sql]);
  const names = useMemo(() => aliases(sql), [sql]);

  if (!stages.length) return null;
  const k = Math.min(s.i, stages.length - 1);
  const st = stages[k];
  const prev = k > 0 ? stages[k - 1] : undefined;
  const { columns, rows, ghosts } = display(stages, k);
  const upper = st.clause.toUpperCase();
  // shade runs of equal values: the stage's own group, GROUP BY's key, or DISTINCT ON's first key
  // (on the ORDER BY that lines the groups up, and on DISTINCT ON itself)
  const has = (c?: string) => !!c && columns.some((x) => colName(x) === c);
  const distinctOnStep = upper === "DISTINCT ON" || (upper === "ORDER BY" && stages.some((x) => x.clause.toUpperCase() === "DISTINCT ON"));
  const grouped =
    st.group ?? ((upper === "GROUP BY" || upper === "HAVING") && has(gk) ? gk : distinctOnStep && has(dk) ? dk : undefined);
  const kept = rows.length - ghosts.length;
  const range = upper.startsWith("DISTINCT") && dr ? dr : ranges.find((r) => r.clause === upper);
  const marks = range ? [{ from: range.from, to: range.to, tone: "hot" as const }] : [];

  const groups = (rs: Cell[][], col?: string | number) => {
    if (col == null) return 0;
    const j = typeof col === "number" ? col : st.columns.findIndex((c) => colName(c) === col);
    return new Set(rs.map((r) => JSON.stringify(r[j] !== null && typeof r[j] === "object" ? (r[j] as { v: unknown }).v : r[j]))).size;
  };

  const auto = (): ReactNode => {
    if (upper === "FROM") return `FROM: ${fmt(st.rows.length)} rows, ${st.columns.length} columns. every clause after this one takes a table like this and hands a table on.`;
    if (upper === "WHERE") return `WHERE kept ${fmt(kept)} of ${fmt(rows.length)} rows. it looks at one row at a time: no groups exist yet, and neither do the SELECT aliases.`;
    if (upper === "GROUP BY")
      return `GROUP BY ${gk ?? ""}: the same ${fmt(st.rows.length)} rows, now in ${groups(st.rows, grouped)} buckets. each bucket will turn into one row.`;
    if (upper === "HAVING") return `HAVING kept ${groups(st.rows, grouped)} of ${groups(prev?.rows ?? [], grouped)} groups (${fmt(st.rows.length)} rows). it filters whole groups, after grouping.`;
    if (upper === "SELECT")
      return `SELECT: one row per group, ${st.columns.length} columns.${names.length ? ` the names ${names.join(" and ")} exist from here on.` : ""}`;
    if (upper === "ORDER BY") return `ORDER BY sorts the ${fmt(st.rows.length)} rows. it runs after SELECT, so it can use the aliases.`;
    if (upper === "LIMIT") return `LIMIT kept ${fmt(kept)} of ${fmt(rows.length)} rows. it's the very last step.`;
    return `${st.clause}: ${fmt(st.rows.length)} rows.`;
  };

  // a stable height: the tallest table any step will draw (folded rows plus their "… n more" lines)
  const tallest = Math.max(
    ...stages.map((_, i) => {
      const d = display(stages, i);
      const v = foldRows(d.rows.length, maxRows, d.ghosts);
      return v.length + foldGaps(d.rows.length, v).length;
    }),
  );

  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 outline-none grid-cols-[minmax(0,1fr)]" aria-label="the clauses of a query, in the order they run">
      <SqlPanel code={sql} marks={marks} file="query.sql" right={`step ${k + 1}: ${st.clause}`} />

      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-11" aria-label="logical order">
        {stages.map((x, i) => (
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
                aria-current={i === k ? "step" : undefined}
                className="flex flex-col items-center rounded-xs px-1.5 py-0.5 transition-[box-shadow,background-color,color] duration-200 ease-sfe"
                style={{
                  boxShadow: i === k ? ring("hot") : ring("line"),
                  background: i === k ? tint("hot", 8) : undefined,
                  color: i === k ? "var(--hot)" : i < k ? "var(--ink)" : "var(--faint)",
                }}
              >
                <span className="leading-[18px] whitespace-nowrap">{x.clause}</span>
                <span className="text-[10px] leading-3 text-faint tabular">
                  {x.rows.length}×{x.columns.length}
                </span>
              </button>
            </li>
          </Fragment>
        ))}
      </ol>

      <div style={{ minHeight: `${tallest * 29 + 62}px` }}>
        <ResultTable
          key={reduce ? "r" : k}
          columns={columns}
          rows={rows}
          ghostRows={ghosts}
          focusRows={ghosts}
          group={grouped}
          maxRows={maxRows}
          dense
          caption={`the table after ${st.clause}`}
          footer={
            ghosts.length ? (
              <>
                {fmt(kept)} rows kept, <span className="line-through">{fmt(ghosts.length)}</span> removed
              </>
            ) : (
              "auto"
            )
          }
        />
      </div>

      <Narration minLines={2}>{st.note || auto()}</Narration>
      {st.sql ? (
        <details className="text-11">
          <summary className="cursor-pointer text-faint select-none hover:text-ink">the query that produced this table</summary>
          <div className="mt-1.5 overflow-x-auto rounded-md bg-well px-3 py-2 whitespace-pre-wrap shadow-[inset_0_0_0_1px_var(--line)]">
            <Sql code={st.sql} />
          </div>
        </details>
      ) : null}
      <StepControls s={s} label="clause" compact={reduce} />
      {provenance != null && provenance !== "" ? typeof provenance === "string" ? <div className="text-right text-[10px] leading-4 text-faint">{provenance}</div> : provenance : null}
    </div>
  );
}
