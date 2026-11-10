"use client";

import { Fragment, useState, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, ResultTable, SqlPanel, Words, clauseRanges, fmt, ring, tint, useReducedMotion } from "@/components/figures/kit";

// GROUP BY as buckets. pick the grouping key; step FROM → (WHERE) → GROUP BY → (HAVING) →
// SELECT and watch the rows sort into buckets, then each bucket collapse into one row. switch
// on the extra column and every bucket has to squeeze several values into one cell, which is
// the error postgres gives you (captured, with its SQLSTATE).
//
// every table here is a pgtrace @stages capture (stagesOf() in ./captured): the GROUP BY stage
// is the kept rows sorted by the key, so a bucket is a run of equal keys; the HAVING stage is
// the rows of the buckets that survive; the SELECT stage is the real result, whose first
// columns are the keys. the error is a captured step too. nothing is grouped in the browser.

type Stage = { clause: string; columns: string[]; rows: (string | null)[][]; note?: string };
export type BucketRun = {
  sql: string;
  /** the grouping columns, in GROUP BY order. none = one bucket for the whole table */
  keys: string[];
  stages: Stage[];
  /** the same query with one more, ungrouped column in SELECT: the sql and postgres's error */
  bad?: { sql: string; error: { sqlstate: string; message: string } };
};

const keyOf = (r: (string | null)[], idx: number[]) => JSON.stringify(idx.map((j) => r[j]));
const lit = (v: string | null) => (v === null ? "null" : /^-?\d+(\.\d+)?$/.test(v) ? v : `'${v}'`);

/** buckets in the order the GROUP BY stage lists them */
function bucketsOf(st: Stage, keys: string[]) {
  const idx = keys.map((k) => st.columns.indexOf(k));
  const out: { key: string; vals: (string | null)[]; rows: (string | null)[][] }[] = [];
  for (const r of st.rows) {
    const k = keyOf(r, idx);
    const last = out[out.length - 1];
    if (last && last.key === k) last.rows.push(r);
    else out.push({ key: k, vals: idx.map((j) => r[j]), rows: [r] });
  }
  return out;
}

export function GroupBuckets({
  options,
  runs,
  extra,
  start,
  trace,
}: {
  options: { key: string; values: (string | { v: string; label: string })[] };
  runs: Record<string, BucketRun>;
  /** the ungrouped column the toggle adds to SELECT */
  extra?: string;
  start?: string;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const first = (o: string | { v: string }) => (typeof o === "string" ? o : o.v);
  const [pick, setPick] = useState(start ?? first(options.values[0]));
  const [bad, setBad] = useState(false);
  const run = runs[pick];
  const stages = run.stages;
  const s = useStepper(stages.length, { interval: 2200 });
  const reduce = useReducedMotion();
  const k = Math.min(s.i, stages.length - 1);
  const st = stages[k];
  const clause = st.clause.toUpperCase();
  const showBad = bad && !!run.bad && clause === "SELECT";
  const sql = showBad && run.bad ? run.bad.sql : run.sql;
  const range = clauseRanges(sql).find((r) => r.clause === clause);
  const marks = range ? [{ from: range.from, to: range.to, tone: "hot" as const }] : [];

  const gb = stages.find((x) => x.clause.toUpperCase() === "GROUP BY");
  const hv = stages.find((x) => x.clause.toUpperCase() === "HAVING");
  const sel = stages.find((x) => x.clause.toUpperCase() === "SELECT");
  const buckets = gb ? bucketsOf(gb, run.keys) : [];
  const survive = hv ? new Set(bucketsOf(hv, run.keys).map((b) => b.key)) : null;
  const idOf = (rows: (string | null)[][]) => new Map(rows.map((r) => [JSON.stringify(r), true]));

  // FROM / WHERE: the table, with WHERE's casualties struck
  let table: ReactNode = null;
  if (clause === "FROM" || clause === "WHERE") {
    const from = stages[0];
    const kept = clause === "WHERE" ? idOf(st.rows) : null;
    const ghosts = kept ? from.rows.flatMap((r, i) => (kept.has(JSON.stringify(r)) ? [] : [i])) : [];
    table = (
      <ResultTable
        key={reduce ? "t" : clause}
        columns={from.columns}
        rows={from.rows}
        ghostRows={ghosts}
        focusRows={ghosts}
        dense
        caption={`the table after ${st.clause}`}
        footer={ghosts.length ? `${fmt(from.rows.length - ghosts.length)} rows kept, ${fmt(ghosts.length)} removed` : "auto"}
      />
    );
  }

  const keyCols = run.keys;
  const cols = gb?.columns ?? stages[0].columns;
  const label = (vals: (string | null)[]) => (keyCols.length ? keyCols.map((c, j) => `${c} = ${lit(vals[j])}`).join(", ") : "the whole table");
  const selIdx = sel ? keyCols.map((c) => sel.columns.indexOf(c)) : [];
  const outRow = (vals: (string | null)[]) => sel?.rows.find((r) => JSON.stringify(selIdx.map((j) => r[j])) === JSON.stringify(vals));
  const exIdx = extra ? cols.indexOf(extra) : -1;

  const bucketView = (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 @min-[560px]:grid-cols-2 @min-[820px]:grid-cols-3" key={reduce ? "b" : `${pick}${clause}${bad}`}>
      {buckets.map((b) => {
        const gone = survive ? !survive.has(b.key) : false;
        const collapsed = clause === "SELECT" && !gone;
        const out = collapsed ? outRow(b.vals) : undefined;
        const many = exIdx >= 0 ? [...new Set(b.rows.map((r) => r[exIdx]))] : [];
        return (
          <div
            key={b.key}
            className="min-w-0 rounded-md bg-well transition-opacity duration-200 ease-sfe"
            style={gone ? { outline: "1px dashed var(--faint)", outlineOffset: -1, opacity: clause === "HAVING" ? 0.75 : 0.45 } : { boxShadow: ring("line-2") }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1 text-11">
              <span className={`min-w-0 truncate ${gone ? "text-faint line-through" : "text-hi"}`}>{label(b.vals)}</span>
              <span className="shrink-0 text-faint tabular">
                {b.rows.length} {b.rows.length === 1 ? "row" : "rows"}
              </span>
            </div>
            {collapsed && sel && out ? (
              <div className="px-2.5 py-2 text-11 leading-[1.7]">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {sel.columns.map((c, j) =>
                    showBad && !keyCols.includes(c) ? null : (
                    <span key={c} className="whitespace-nowrap">
                      <span className="text-faint">{c} </span>
                      <span className={out[j] === null ? "text-faint italic" : keyCols.includes(c) ? "text-hot" : "text-hi"}>{out[j] ?? "null"}</span>
                    </span>
                    ),
                  )}
                  {showBad && extra && (
                    <span className="whitespace-nowrap">
                      <span className="text-faint">{extra} </span>
                      {many.length === 1 ? (
                        <span className="text-hi">{many[0]}</span>
                      ) : (
                        <span style={{ color: "var(--dead)" }}>{many.length} values?</span>
                      )}
                    </span>
                  )}
                </div>
                {showBad && many.length > 1 && (
                  <ul className="mt-1 border-l pl-2 text-[10.5px] leading-[1.6] text-mute" style={{ borderColor: "var(--dead)" }}>
                    {many.map((m) => (
                      <li key={String(m)} className="truncate">
                        {m}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <ul className="px-2.5 py-1.5 text-11 leading-[1.75]">
                {b.rows.map((r, i) => (
                  <li key={i} className={`flex min-w-0 gap-2 whitespace-nowrap ${gone ? "text-faint" : ""}`}>
                    {r.map((v, j) => {
                      const c = cols[j];
                      if (c === extra && !showBad) return null;
                      const isKey = keyCols.includes(c);
                      return (
                        <span key={j} className={`${j === cols.length - 1 ? "min-w-0 truncate" : "shrink-0"} ${v === null ? "italic text-faint" : isKey && !gone ? "text-hot" : j === 0 ? "text-hi" : "text-mute"}`}>
                          {v ?? "null"}
                        </span>
                      );
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );

  const nb = buckets.length;
  const auto = (): string => {
    if (clause === "FROM") return `FROM hands over all ${fmt(stages[0].rows.length)} rows.`;
    if (clause === "WHERE") return `WHERE keeps ${fmt(st.rows.length)} of ${fmt(stages[0].rows.length)} rows, one row at a time, before anything is grouped.`;
    if (clause === "GROUP BY")
      return keyCols.length
        ? `the same ${fmt(st.rows.length)} rows, sorted into ${nb} ${nb === 1 ? "bucket" : "buckets"}: one for each different ${keyCols.join(", ")}.`
        : `no GROUP BY, but there's an aggregate in SELECT, so the whole table is one bucket.`;
    if (clause === "HAVING") return `HAVING keeps ${survive?.size ?? 0} of ${nb} buckets. it looks at whole buckets, never at single rows.`;
    if (clause === "SELECT") return `one row per bucket: ${fmt(st.rows.length)} ${st.rows.length === 1 ? "row" : "rows"}.`;
    return `${st.clause}: ${fmt(st.rows.length)} rows.`;
  };
  const badNote =
    run.bad &&
    `postgres refuses the whole query before it reads a row: ${extra} isn't in GROUP BY and isn't inside an aggregate, so a bucket would have to put several values into one cell. it refuses even if every bucket happened to hold one value, because the rule is about the query, not the data.`;

  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" aria-label="GROUP BY: rows into buckets, buckets into rows">
      <div className="grid">
        <div className={`grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 py-2 text-12 @min-[520px]:grid-cols-[11ch_minmax(0,1fr)] ${extra ? "border-b border-line" : ""}`}>
          <span className="pt-0.5 text-faint">{options.key} =</span>
          <Words options={options.values} value={pick} onChange={(v) => setPick(v)} label={options.key} />
        </div>
        {extra && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 py-2 text-12 @min-[520px]:grid-cols-[11ch_minmax(0,1fr)]">
            <span className="pt-0.5 text-faint">SELECT =</span>
            <Words
              options={[
                { v: "ok", label: "keys and aggregates" },
                { v: "bad", label: `+ ${extra}` },
              ]}
              value={bad ? "bad" : "ok"}
              onChange={(v) => {
                setBad(v === "bad");
                if (v === "bad") s.go(stages.length - 1);
              }}
              label="what SELECT asks for"
            />
          </div>
        )}
      </div>

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
                className="rounded-xs px-1.5 py-0.5 leading-[18px] whitespace-nowrap transition-[box-shadow,background-color,color] duration-200 ease-sfe"
                style={{
                  boxShadow: i === k ? ring("hot") : ring("line"),
                  background: i === k ? tint("hot", 8) : undefined,
                  color: i === k ? "var(--hot)" : i < k ? "var(--ink)" : "var(--faint)",
                }}
              >
                {x.clause}
              </button>
            </li>
          </Fragment>
        ))}
      </ol>

      <div className="grid min-h-[16rem] content-start gap-3">
        {table ?? bucketView}
        {clause === "SELECT" && !showBad && sel && (
          <ResultTable key={reduce ? "r" : `${pick}r`} columns={sel.columns} rows={sel.rows} dense caption="the result: one row per bucket" />
        )}
      </div>

      {showBad && run.bad && (
        <div className="rounded-md bg-well px-3 py-2.5 text-12 leading-[1.6]" style={{ boxShadow: ring("dead", 55), background: tint("dead", 6) }} role="status">
          <span style={{ color: "var(--dead)" }}>ERROR:</span> <span className="text-ink">{run.bad.error.message}</span>
          <span className="ml-2 text-11 text-faint">SQLSTATE {run.bad.error.sqlstate}</span>
        </div>
      )}

      <Narration minLines={2}>{showBad ? badNote : st.note || auto()}</Narration>
      <StepControls s={s} label="clause" compact={reduce} />
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
