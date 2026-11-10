"use client";

import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, ResultTable, SqlPanel, useReducedMotion, type Cell, type Ink } from "@/components/figures/kit";

// "for each row on the left, run the query on the right": a correlated subquery or a LATERAL
// join, one outer row at a time. the cursor walks the outer table; under it, the inner query
// with that row's value filled in, and what it returned. the last step is the whole query's
// result. every table is a captured result (the inner query really ran with that value).
//
//   <ForEachRow outer={customers} each={[{ sql, columns, rows, note }, …]} final={result} trace={p} />

type Col = { name: string; type?: string };
type Res = { sql: string; note?: string; columns: Col[]; rows: (string | null)[][] };

export function ForEachRow({
  outer,
  each,
  final,
  label = "outer row",
  hot = [],
  trace,
}: {
  outer: { name: string; columns: Col[]; rows: (string | null)[][] };
  /** one per outer row, in the same order: the inner query as it ran for that row */
  each: Res[];
  final?: Res;
  label?: string;
  /** substrings of the inner sql to light up (the outer value) */
  hot?: string[];
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const reduce = useReducedMotion();
  const n = each.length + (final ? 1 : 0);
  const s = useStepper(n, { interval: 2200 });
  const atFinal = final && s.i === each.length;
  const cur = atFinal ? undefined : each[s.i];
  const marks = cur
    ? hot.flatMap((h) => {
        const at = cur.sql.indexOf(h);
        return at >= 0 ? [{ from: at, to: at + h.length, tone: "hot" as const }] : [];
      })
    : [];
  const tones: (Ink | undefined)[] = outer.rows.map((_, i) => (atFinal || i < s.i ? (each[i].rows.length ? "live" : undefined) : i === s.i ? "hot" : undefined));
  const innerMax = Math.max(...each.map((e) => e.rows.length), 1);
  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" aria-label="for each outer row, the inner query runs again">
      <div className="grid min-w-0 gap-1 grid-cols-[minmax(0,1fr)]">
        <div className="text-11 text-faint">{outer.name}</div>
        <ResultTable columns={outer.columns} rows={outer.rows as Cell[][]} cursor={atFinal ? "after" : s.i} rowTones={tones} dense footer="none" />
      </div>
      {cur ? (
        <div className="grid min-w-0 gap-2 grid-cols-[minmax(0,1fr)]">
          <div className="text-11 text-faint">
            the inner query, for {label} {s.i + 1}
          </div>
          <SqlPanel code={cur.sql} marks={marks} nolines wrap />
          <div style={{ minHeight: `${innerMax * 29 + 34}px` }}>
            <ResultTable columns={cur.columns} rows={cur.rows as Cell[][]} dense />
          </div>
        </div>
      ) : final ? (
        <div className="grid min-w-0 gap-2 grid-cols-[minmax(0,1fr)]">
          <div className="text-11 text-faint">the whole query's result</div>
          <SqlPanel code={final.sql} nolines wrap />
          <ResultTable columns={final.columns} rows={final.rows as Cell[][]} rowTones={final.rows.map(() => "live")} dense maxRows={12} />
        </div>
      ) : null}
      <Narration minLines={2}>{cur?.note ?? final?.note}</Narration>
      <StepControls s={s} label={label} compact={reduce} />
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
