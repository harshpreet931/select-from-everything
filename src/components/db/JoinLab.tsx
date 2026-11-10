"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { FIG_TABLE, Narration, Provenance, ResultTable, Row, Slider, Stat, Words, fmt, ring, rng, tint, useReducedMotion, type Ink } from "@/components/figures/kit";
import { logicalJoin, runJoin, type JTable, type JoinAlgo, type JoinKind, type LogicalKind } from "@/lib/db/sim/join";

// two ways to look at a join.
// logical: every left row against every right row. the pairs that satisfy ON are live; an
//   outer join adds the leftovers padded with NULLs. duplicates multiply (2 × 2 = 4 rows),
//   which is where venn diagrams lie.
// algorithms: the same answer four ways. nested loop compares everything, an index looks
//   each key up, hash builds a table on one side and probes it with the other, merge walks
//   two sorted inputs. cursors are ref, the pair being compared is hot, output rows live.
//
//   <JoinLab left={orders} right={products} on={["product_id", "id"]} logical />
//   <JoinLab left={l} right={r} on={["id", "id"]} algos={["nested-loop", "hash", "merge"]} workMem={4} />

const ALGO_LABEL: Record<JoinAlgo, string> = { "nested-loop": "nested loop", "index-nl": "index nested loop", hash: "hash join", merge: "merge join" };

export function JoinLab({
  left: left0,
  right: right0,
  on,
  algos = ["nested-loop", "index-nl", "hash", "merge"],
  kind: kind0 = "inner",
  logical,
  workMem,
}: {
  left: JTable;
  right: JTable;
  on: [string, string];
  algos?: JoinAlgo[];
  kind?: LogicalKind;
  logical?: boolean;
  /** hash join memory, in rows; shows a work_mem slider */
  workMem?: number;
}) {
  const [extra, setExtra] = useState<JTable["rows"]>([]);
  const [seed, setSeed] = useState(0);
  const shuffle = <T,>(xs: T[]) => {
    if (!seed) return xs;
    const r = rng(seed);
    return xs
      .map((x) => [r(), x] as const)
      .sort((a, b) => a[0] - b[0])
      .map((p) => p[1]);
  };
  const left = useMemo(() => ({ ...left0, rows: shuffle(left0.rows) }), [left0, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const right = useMemo(() => ({ ...right0, rows: shuffle([...right0.rows, ...extra]) }), [right0, extra, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const addDup = () => {
    const lk = left0.columns.indexOf(on[0]);
    const keys = left0.rows.map((r) => r[lk]).filter((v) => v !== null);
    const k = keys[(extra.length * 2 + 1) % Math.max(1, keys.length)];
    const proto = right0.rows[0] ?? right0.columns.map(() => null);
    const rk = right0.columns.indexOf(on[1]);
    setExtra((e) => [...e, proto.map((v, j) => (j === rk ? k : typeof v === "string" ? `${v}′` : v))]);
  };
  const actions = (
    <>
      <button type="button" className="act" onClick={addDup} disabled={extra.length >= 3}>
        add a duplicate key
      </button>
      {!logical && (
        <button type="button" className="act" onClick={() => setSeed((x) => x + 1)}>
          shuffle
        </button>
      )}
      {(extra.length > 0 || seed > 0) && (
        <button type="button" className="act" onClick={() => (setExtra([]), setSeed(0))}>
          reset data
        </button>
      )}
    </>
  );
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      {logical ? (
        <Logical left={left} right={right} on={on} kind0={kind0} actions={actions} />
      ) : (
        <Algorithms left={left} right={right} on={on} algos={algos} kind0={(["inner", "left", "semi", "anti"].includes(kind0) ? kind0 : "inner") as JoinKind} workMem={workMem} actions={actions} />
      )}
    </div>
  );
}

function Logical({ left, right, on, kind0, actions }: { left: JTable; right: JTable; on: [string, string]; kind0: LogicalKind; actions: ReactNode }) {
  const [kind, setKind] = useState<LogicalKind>(kind0);
  const { match, rows } = logicalJoin(left, right, on, kind);
  const lk = left.columns.indexOf(on[0]);
  const rk = right.columns.indexOf(on[1]);
  const lUn = left.rows.map((_, i) => !match[i].some(Boolean));
  const rUn = right.rows.map((_, j) => !match.some((m) => m[j]));
  const pairs = rows.filter((r) => r.li >= 0 && r.ri >= 0).length;
  const semiLike = kind === "semi" || kind === "anti";
  const cols = semiLike ? left.columns : [...left.columns, ...right.columns.map((c) => (left.columns.includes(c) ? `${right.name}.${c}` : c))];
  const keepL = (i: number) => (kind === "left" || kind === "full" ? lUn[i] : false);
  const keepR = (j: number) => (kind === "right" || kind === "full" ? rUn[j] : false);
  const label = (t: JTable, r: JTable["rows"][number], k: number) => `${r[k] ?? "NULL"} ${r.filter((_, x) => x !== k).slice(0, 1).join(" ")}`;
  return (
    <>
      <div>
        <Row k="join =" w="8ch">
          <Words label="join type" options={["inner", "left", "right", "full", "semi", "anti"] as LogicalKind[]} value={kind} onChange={setKind} />
        </Row>
        <Row k="data =" w="8ch" last>
          {actions}
        </Row>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className={`mx-auto w-auto border-collapse text-11 @min-[520px]:text-12 ${FIG_TABLE}`} aria-label={`every ${left.name} row against every ${right.name} row; ${pairs} pairs satisfy ON`}>
          <thead>
            <tr>
              <th className="border-0 px-2 py-1 text-left font-normal text-faint">
                {left.name}.{on[0]} ↓ {right.name}.{on[1]} →
              </th>
              {right.rows.map((r, j) => (
                <th key={j} className="border-0 px-1.5 py-1 font-normal whitespace-nowrap" style={{ color: keepR(j) ? "var(--hi)" : "var(--mute)", boxShadow: keepR(j) ? `inset 0 -2px 0 var(--ref)` : undefined }}>
                  {label(right, r, rk)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {left.rows.map((r, i) => (
              <tr key={i}>
                <th className="border-0 px-2 py-1 text-left font-normal whitespace-nowrap" style={{ color: keepL(i) ? "var(--hi)" : "var(--mute)", boxShadow: keepL(i) ? `inset 2px 0 0 var(--ref)` : undefined }}>
                  {label(left, r, lk)}
                </th>
                {right.rows.map((_, j) => {
                  const m = match[i][j];
                  return (
                    <td key={j} className="p-0.5 text-center">
                      <span
                        className="inline-flex size-6 items-center justify-center rounded-xs transition-[background-color,box-shadow] duration-200 ease-sfe"
                        style={{ background: m && !semiLike ? tint("live", 22) : m ? tint("live", 12) : undefined, boxShadow: m ? ring("live", 70) : ring("line") }}
                        aria-label={m ? "match" : "no match"}
                      >
                        {m ? <span className="text-live">✓</span> : <span className="text-faint">·</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ResultTable
        columns={cols}
        rows={rows.map((r) => r.row)}
        rowTones={rows.map((r) => (r.li >= 0 && r.ri >= 0 ? "live" : semiLike ? "live" : undefined))}
        dense
        caption={`${kind} join result`}
      />
      <Narration minLines={2}>
        {kind === "inner"
          ? `${pairs} pairs satisfy ON, so ${pairs} rows. a key that appears twice on each side matches 2 × 2 = 4 times, and NULL matches nothing, not even NULL.`
          : kind === "semi"
            ? `EXISTS keeps each ${left.name} row once if it has at least one match: ${rows.length} rows, no duplicates, no ${right.name} columns.`
            : kind === "anti"
              ? `NOT EXISTS keeps the ${left.name} rows with no match at all: ${rows.length}.${rows.some((r) => r.li >= 0 && left.rows[r.li][lk] === null) ? " the NULL key is one of them: NULL matches nothing." : ""}`
              : `the ${pairs} matching pairs, plus ${rows.length - pairs} leftover row${rows.length - pairs === 1 ? "" : "s"} padded with NULLs (marked ref above): an outer join never loses a row from its outer side.`}
      </Narration>
      <Provenance sim="model of SQL join semantics" checked />
    </>
  );
}

function Algorithms({ left, right, on, algos, kind0, workMem, actions }: { left: JTable; right: JTable; on: [string, string]; algos: JoinAlgo[]; kind0: JoinKind; workMem?: number; actions: ReactNode }) {
  const [algo, setAlgo] = useState<JoinAlgo>(algos[0]);
  const [kind, setKind] = useState<JoinKind>(kind0);
  const [wm, setWm] = useState(workMem ?? right.rows.length + 1);
  const run = useMemo(() => runJoin(left, right, on, algo, kind, { workMem: workMem ? wm : undefined }), [left, right, on, algo, kind, wm, workMem]);
  const all = useMemo(() => algos.map((a) => ({ a, c: runJoin(left, right, on, a, kind).steps.at(-1)!.c })), [algos, left, right, on, kind]);
  return (
    <>
      <div>
        <Row k="algorithm =" w="12ch">
          <Words label="join algorithm" options={algos.map((a) => ({ v: a, label: ALGO_LABEL[a] }))} value={algo} onChange={setAlgo} />
        </Row>
        <Row k="join =" w="12ch">
          <Words label="join type" options={["inner", "left", "semi", "anti"] as JoinKind[]} value={kind} onChange={setKind} />
        </Row>
        {workMem !== undefined && algo === "hash" && (
          <Row k="work_mem =" w="12ch">
            <Slider k="work_mem in rows" min={1} max={right.rows.length + 1} value={wm} onChange={setWm} format={(v) => `${v} rows`} />
          </Row>
        )}
        <Row k="data =" w="12ch" last>
          {actions}
        </Row>
      </div>
      <Run key={`${algo}|${kind}|${wm}|${right.rows.length}|${JSON.stringify(left.rows[0])}|${JSON.stringify(right.rows[0])}`} run={run} left={left} right={right} on={on} all={all} />
    </>
  );
}

function Run({ run, left, right, on, all }: { run: ReturnType<typeof runJoin>; left: JTable; right: JTable; on: [string, string]; all: { a: JoinAlgo; c: { comparisons: number } }[] }) {
  const reduce = useReducedMotion();
  const s = useStepper(run.steps.length, { interval: 650 });
  const st = run.steps[s.i];
  const sorted = run.algo === "merge" && s.i > 0;
  const lOrder = sorted ? run.sortedL! : left.rows.map((_, i) => i);
  const rOrder = sorted ? run.sortedR! : right.rows.map((_, i) => i);
  const lPos = st.li !== undefined ? lOrder.indexOf(st.li) : undefined;
  const rPos = st.ri !== undefined ? rOrder.indexOf(st.ri) : undefined;
  const pairTone: Ink | undefined = st.cmp === true ? "live" : st.cmp === false ? "hot" : undefined;
  const out = run.output.slice(0, st.out);
  const outFrom = run.from.slice(0, st.out);
  const max = Math.max(1, ...all.map((x) => x.c.comparisons));
  const keyCol = (t: JTable, c: string) => t.columns.indexOf(c);
  const side = (t: JTable, order: number[], pos: number | undefined, key: string, used?: (i: number) => boolean) => (
    <div className="grid min-w-0 content-start gap-1 grid-cols-[minmax(0,1fr)]">
      <div className="text-11 text-faint">
        {t.name}
        {sorted ? ` (sorted on ${key})` : ""}
      </div>
      <ResultTable
        columns={t.columns}
        rows={order.map((i) => t.rows[i])}
        cursor={pos ?? (s.i === 0 ? "before" : undefined)}
        rowTones={order.map((_, p) => (p === pos && t === right ? pairTone : used?.(order[p]) ? "live" : undefined))}
        hotCell={pos !== undefined && t === right && st.cmp === false ? [pos, keyCol(t, key)] : undefined}
        dense
        footer="none"
      />
    </div>
  );
  return (
    <div {...s.keys} className="grid min-w-0 gap-4 outline-none grid-cols-[minmax(0,1fr)]" aria-label={`${ALGO_LABEL[run.algo]}, step by step`}>
      <div className="grid min-w-0 gap-3 @min-[560px]:grid-cols-2 grid-cols-[minmax(0,1fr)]">
        {side(left, lOrder, lPos, on[0], (i) => outFrom.some((f) => f[0] === i))}
        {side(right, rOrder, rPos, on[1])}
      </div>
      {run.buckets && (
        <div className="grid gap-1">
          <div className="text-11 text-faint">hash table on {right.name}.{on[1]}</div>
          <div className="flex flex-wrap gap-1.5">
            {run.buckets.map((b, i) => {
              const inTable = (j: number) => st.phase !== "build" || (st.ri !== undefined && j <= st.ri);
              const on_ = st.bucket === i;
              return (
                <span
                  key={i}
                  className="inline-flex min-w-[4.5rem] items-center gap-1 rounded-xs px-1.5 py-0.5 text-11 tabular transition-[box-shadow,background-color] duration-200"
                  style={{ boxShadow: on_ ? ring("hot", undefined, 1.5) : ring("line-2"), background: on_ ? tint("hot", 8) : undefined }}
                >
                  <span className="text-faint">{i}:</span>
                  {b.filter(inTable).map((j) => (
                    <span key={j} className="text-hi">
                      {String(right.rows[j][keyCol(right, on[1])])}
                    </span>
                  ))}
                </span>
              );
            })}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 @min-[520px]:grid-cols-4">
        <Stat k="comparisons" v={fmt(st.c.comparisons)} />
        <Stat k="rows read" v={fmt(st.c.read)} />
        <Stat k={run.algo === "hash" ? "in hash table" : "memory"} v={run.algo === "hash" ? fmt(st.c.memory) : "·"} />
        <Stat k="batches" v={run.algo === "hash" ? fmt(st.c.batches) : "·"} />
      </div>
      <div className="grid gap-1">
        <div className="text-11 text-faint">output</div>
        <ResultTable columns={run.columns} rows={out} rowTones={out.map((_, i) => (i === out.length - 1 && st.out > (run.steps[s.i - 1]?.out ?? 0) ? "live" : undefined))} dense />
      </div>
      <Narration minLines={2} tag={st.phase}>
        {st.note}
      </Narration>
      <StepControls s={s} compact={reduce} />
      {s.atEnd && (
        <div className="grid gap-1.5" aria-label="comparisons per algorithm">
          <div className="text-11 text-faint">comparisons, same inputs</div>
          {all.map(({ a, c }) => (
            <Fragment key={a}>
              <div className="grid grid-cols-[16ch_minmax(0,1fr)_5ch] items-center gap-3 text-11">
                <span className={a === run.algo ? "text-hi" : "text-mute"}>{ALGO_LABEL[a]}</span>
                <span className="relative h-2 bg-well-2">
                  <span className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-sfe" style={{ width: `${(c.comparisons / max) * 100}%`, background: a === run.algo ? "var(--hi)" : "var(--mute)" }} />
                </span>
                <span className="text-right text-ink tabular">{c.comparisons}</span>
              </div>
            </Fragment>
          ))}
        </div>
      )}
      <Provenance sim="model of the join algorithms" checked />
    </div>
  );
}
