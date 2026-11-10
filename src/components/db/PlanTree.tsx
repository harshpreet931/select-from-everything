"use client";

import { useMemo, useState, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Chip, Legend, Narration, Provenance, ResultTable, Row, Toggle, fmt, ring, tint, useReducedMotion, useWidth, type Ink } from "@/components/figures/kit";
import type { PlanNode, Table } from "@/lib/db/views";
import { fromExplainJson, misestimates, planNodes, stoppedEarly } from "@/lib/db/fromTrace";
import { runVolcano, predText, type VEvent, type VRow } from "@/lib/db/sim/volcano";
import { describePlan } from "@/lib/db/describe";

// a query plan. data flows up: leaves read tables, the root hands rows to the client.
// estimates are mute, actuals are hi, an estimate off by more than 10x (either way) is dead.
// a thin bar shows each node's share of the total cost; buffers: hits live, reads hot.
// under 560 px the tree becomes the indented outline EXPLAIN prints.
// mode="volcano" steps through the executor's next() calls: the call edge goes hot, a row
// travels up, EOF is faint, the output grows at the root, and LIMIT stops the pull early.
//
//   <PlanTree plan={explainJson} />                         raw EXPLAIN (FORMAT JSON) works
// (server code that needs a PlanNode: fromExplainJson from @/lib/db/fromTrace, not from here)
//   <PlanTree plan={plan} mode="volcano" tables={{ products }} />   plan nodes carry `sim` specs


type Facet = "est" | "actual" | "buffers" | "cost";


/** per plan: real misestimates (ran to completion, off by the ratio or more) and nodes that stopped early */
type Flags = { mis: Map<string, number>; early: Set<string> };

type Live = { calls?: string; ret?: string; eof?: Set<string>; built?: Record<string, number>; counts?: Record<string, number>; row?: VRow };

function NodeCard({ n, show, total, flags, live, focus, compact }: { n: PlanNode; show: Set<Facet>; total: number; flags: Flags; live?: Live; focus?: string; compact?: boolean }) {
  const r = flags.mis.get(n.id) ?? 1;
  const bad = flags.mis.has(n.id);
  // stopped early on purpose (a Limit, a semi join, a subplan above it): fewer rows than planned is expected
  const early = flags.early.has(n.id) && !!n.actual && !!n.est && n.actual.loops > 0 && n.actual.rows < n.est.rows;
  const isCall = live?.calls === n.id;
  const isRet = live?.ret === n.id;
  const done = live?.eof?.has(n.id);
  const hot = isCall || isRet || focus === n.id;
  const count = live?.counts?.[n.id] ?? 0;
  return (
    <div
      className="min-w-0 rounded-md bg-well px-2.5 py-1.5 text-left transition-[box-shadow,background-color,opacity] duration-200 ease-sfe"
      style={{
        boxShadow: hot ? ring("hot", undefined, 1.5) : ring("line-2"),
        background: hot ? tint("hot", 7) : undefined,
        opacity: done ? 0.55 : 1,
        maxWidth: compact ? undefined : "16rem",
      }}
    >
      {/* a SubPlan, InitPlan or CTE isn't an ordinary child: say which it is */}
      {(n.subplan || n.parent === "SubPlan" || n.parent === "InitPlan") && (
        <div className="mb-0.5 text-[10px] leading-3 text-faint italic">{n.subplan ?? n.parent}</div>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-12 text-hi">{n.op}</span>
        {n.disabled && (
          <Chip tone="faint" title="Disabled: true. an enable_* setting is off for this kind of node, but the planner had nothing else, so it used it anyway">
            disabled
          </Chip>
        )}
        {bad && show.has("actual") && n.actual && !live && (
          <Chip tone="dead" title="estimate vs actual, for a node that ran to completion">
            {fmt(r, r < 10 ? 1 : 0)}× off
          </Chip>
        )}
        {early && show.has("actual") && !live && (
          <Chip tone="faint" title="something above stopped asking for rows (a Limit, a semi or anti join, a subplan): the planner expected that, so fewer rows than estimated isn't a misestimate">
            stopped early
          </Chip>
        )}
      </div>
      {n.detail?.map((d, i) => (
        <div key={i} className="text-[10.5px] leading-4 break-words text-mute">
          {d}
        </div>
      ))}
      {(show.has("est") || show.has("actual")) && (n.est || n.actual) && (
        <div className="mt-1 flex flex-wrap gap-x-2 text-11 tabular">
          {show.has("actual") && n.actual && live ? (
            <span className="text-faint">EXPLAIN: {fmt(n.actual.rows, 2)}</span>
          ) : show.has("actual") && n.actual && n.actual.loops === 0 ? (
            // text EXPLAIN's spelling for a node that never ran (a pruned partition, the far side of an empty join)
            <span className="text-faint italic">never executed</span>
          ) : show.has("actual") && n.actual && (
            <span style={{ color: bad ? "var(--dead)" : "var(--hi)" }}>
              rows {fmt(n.actual.rows, 2)}
              {n.actual.loops > 1 ? <span className="text-faint"> ×{n.actual.loops} loops</span> : null}
            </span>
          )}
          {show.has("est") && n.est && (
            <span className="text-mute" style={{ textDecorationLine: "underline", textDecorationStyle: "dashed", textDecorationColor: "var(--line-2)", textUnderlineOffset: 3 }}>
              est {fmt(n.est.rows)}
            </span>
          )}
        </div>
      )}
      {show.has("cost") && n.est && total > 0 && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-faint tabular" title={`cost ${n.est.startup}..${n.est.total}`}>
          <span className="relative h-[3px] flex-1 rounded-full bg-well-2">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(2, (n.est.total / total) * 100)}%`, background: "var(--mute)" }} />
          </span>
          <span>{fmt(n.est.total, 2)}</span>
        </div>
      )}
      {show.has("buffers") && n.buffers && (
        <div className="mt-0.5 text-[10.5px] tabular">
          <span className="text-live">hit {fmt(n.buffers.hit)}</span>
          {n.buffers.read > 0 && <span className="ml-2 text-hot">read {fmt(n.buffers.read)}</span>}
          {(n.buffers.dirtied ?? 0) > 0 && <span className="ml-2 text-accent">dirtied {fmt(n.buffers.dirtied!)}</span>}
        </div>
      )}
      {live && (
        <div className="mt-1 flex items-center gap-1.5 text-[10.5px] tabular">
          <span className={count ? "text-hi" : "text-faint"}>returned {count}</span>
          {live.built?.[n.id] !== undefined && <span className="text-mute">· built {live.built[n.id]}</span>}
          {done && <span className="text-faint">· EOF</span>}
        </div>
      )}
    </div>
  );
}

/** the tree, top-down, with css connectors. data flows up them. */
function TreeView({ n, ...p }: { n: PlanNode; show: Set<Facet>; total: number; flags: Flags; live?: Live; focus?: string }) {
  const edgeHot = (kid: string) => p.live && (p.live.calls === kid || p.live.ret === kid);
  return (
    <div className="flex flex-col items-center">
      <NodeCard n={n} {...p} />
      {n.kids.length > 0 && (
        <>
          <span aria-hidden className="h-3 w-px bg-line-2" />
          <div className="flex items-start">
            {n.kids.map((k, i) => {
              const hot = edgeHot(k.id);
              const last = n.kids.length - 1;
              return (
                <div key={k.id} className="relative flex flex-col items-center px-2 pt-4">
                  {n.kids.length > 1 && <span aria-hidden className="absolute top-0 h-px bg-line-2" style={{ left: i === 0 ? "50%" : 0, right: i === last ? "50%" : 0 }} />}
                  <span aria-hidden className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2" style={{ background: hot ? "var(--hot)" : "var(--line-2)", width: hot ? 2 : 1 }} />
                  {hot && (
                    <span className="absolute top-0.5 left-1/2 ml-1.5 text-[10px] whitespace-nowrap text-hot">{p.live?.calls === k.id ? "next() ↓" : "↑ row"}</span>
                  )}
                  <TreeView n={k} {...p} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** the indented outline EXPLAIN prints, for narrow screens */
function OutlineView({ n, depth = 0, ...p }: { n: PlanNode; depth?: number; show: Set<Facet>; total: number; flags: Flags; live?: Live; focus?: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex min-w-0 gap-1.5" style={{ paddingLeft: depth * 14 }}>
        {depth > 0 && (
          <span aria-hidden className="pt-1.5 text-11" style={{ color: p.live && (p.live.calls === n.id || p.live.ret === n.id) ? "var(--hot)" : "var(--faint)" }}>
            ↳
          </span>
        )}
        <div className="min-w-0 flex-1">
          <NodeCard n={n} {...p} compact />
        </div>
      </div>
      {n.kids.map((k) => (
        <OutlineView key={k.id} n={k} depth={depth + 1} {...p} />
      ))}
    </div>
  );
}

export function PlanDiagram({ plan, show, misestimate = 10, live, focus }: { plan: PlanNode; show: Set<Facet>; misestimate?: number; live?: Live; focus?: string }) {
  const [wrap, w] = useWidth<HTMLDivElement>(700);
  const total = plan.est?.total ?? 0;
  const narrow = w < 560;
  const flags = useMemo<Flags>(() => ({ mis: misestimates(plan, misestimate), early: stoppedEarly(plan) }), [plan, misestimate]);
  return (
    <div ref={wrap} className="min-w-0 overflow-x-auto" role="img" aria-label={describePlan(plan)}>
      <div className={narrow ? "" : "flex min-w-max justify-center py-1"}>
        {narrow ? <OutlineView n={plan} show={show} total={total} flags={flags} live={live} focus={focus} /> : <TreeView n={plan} show={show} total={total} flags={flags} live={live} focus={focus} />}
      </div>
    </div>
  );
}

export function PlanTree({
  plan: raw,
  show: show0,
  mode = "tree",
  tables,
  misestimate = 10,
  focus,
  sql,
  provenance,
}: {
  plan: PlanNode | unknown;
  show?: Facet[];
  mode?: "tree" | "volcano";
  tables?: Record<string, Table>;
  misestimate?: number;
  focus?: string;
  sql?: string;
  provenance?: ReactNode;
}) {
  const plan = useMemo(() => (raw && typeof raw === "object" && "op" in (raw as object) && "kids" in (raw as object) ? (raw as PlanNode) : fromExplainJson(raw)), [raw]);
  const nodes = planNodes(plan);
  const available: Facet[] = (["actual", "est", "buffers", "cost"] as Facet[]).filter((f) =>
    f === "actual" ? nodes.some((n) => n.actual) : f === "buffers" ? nodes.some((n) => n.buffers) : f === "est" || f === "cost" ? nodes.some((n) => n.est) : false,
  );
  const [show, setShow] = useState<Set<Facet>>(() => new Set(show0 ?? available.filter((f) => f !== "cost")));
  if (mode === "volcano") return <Volcano plan={plan} tables={tables ?? {}} provenance={provenance} />;
  const misses = [...misestimates(plan, misestimate).keys()];
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      {available.length > 1 && (
        <Row k="show =" w="8ch" last>
          {available.map((f) => (
            <Toggle key={f} on={show.has(f)} onChange={(on) => setShow((s) => new Set(on ? [...s, f] : [...s].filter((x) => x !== f)))}>
              {f === "est" ? "estimates" : f === "actual" ? "actual rows" : f}
            </Toggle>
          ))}
        </Row>
      )}
      <PlanDiagram plan={plan} show={show} misestimate={misestimate} focus={focus} />
      <Legend
        items={[
          ...(show.has("actual") ? ([["hi", "actual rows"]] as [Ink, string][]) : []),
          ...(show.has("est") ? ([["mute", "estimated rows"]] as [Ink, string][]) : []),
          ...(misses.length && show.has("actual") ? ([["dead", `estimate off by ${misestimate}× or more`]] as [Ink, string][]) : []),
          ...(show.has("buffers") && nodes.some((n) => n.buffers?.hit) ? ([["live", "buffer hits"]] as [Ink, string][]) : []),
          ...(show.has("buffers") && nodes.some((n) => n.buffers?.read) ? ([["hot", "buffer reads"]] as [Ink, string][]) : []),
        ]}
      />
      {sql ? <div className="text-11 text-faint">{sql}</div> : null}
      {provenance != null && <div className="text-right text-[10px] text-faint">{provenance}</div>}
    </div>
  );
}

const rowText = (r?: VRow) =>
  r
    ? Object.entries(r)
        .slice(0, 3)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")
    : "";

function Volcano({ plan, tables, provenance }: { plan: PlanNode; tables: Record<string, Table>; provenance?: ReactNode }) {
  const run = useMemo(() => runVolcano(plan, tables, { maxEvents: 1200 }), [plan, tables]);
  const ev = run.events;
  const reduce = useReducedMotion();
  const s = useStepper(ev.length + 1, { interval: 700 });
  const k = s.i; // events applied so far
  const byId = new Map(planNodes(plan).map((n) => [n.id, n]));
  // replay events 0..k-1
  const live: Live = { eof: new Set(), built: {}, counts: {} };
  const out: VRow[] = [];
  for (let i = 0; i < k; i++) {
    const e = ev[i];
    if (e.kind === "return") {
      live.counts![e.node] = (live.counts![e.node] ?? 0) + 1;
      if (e.node === plan.id) out.push(e.row!);
    }
    if (e.kind === "eof") live.eof!.add(e.node);
    if (e.kind === "build") live.built![e.node] = e.n ?? 0;
  }
  const last: VEvent | undefined = k > 0 ? ev[k - 1] : undefined;
  if (last?.kind === "call") live.calls = last.node;
  if (last?.kind === "return") {
    live.ret = last.node;
    live.row = last.row;
  }
  const nm = (id?: string) => (id ? (byId.get(id)?.op ?? id) : "the client");
  const describe = (e?: VEvent): ReactNode => {
    if (!e) return `the client asks the root for a row. every node only ever asks its child for the next one.`;
    const n = byId.get(e.node);
    if (e.kind === "call") return `${nm(e.parent)} calls next() on ${n?.op}.`;
    if (e.kind === "return") {
      const why = n?.sim?.where?.length && /Scan$/.test(n.op) ? ` (${n.sim.where.map(predText).join(" and ")} holds)` : "";
      return `${n?.op} returns one row to ${nm(e.parent)}: ${rowText(e.row)}${why}.`;
    }
    if (e.kind === "build") return `${n?.op} had to read all of its input before returning anything: ${e.n} rows ${n?.op === "Hash" ? "hashed" : n?.op === "Sort" ? "sorted" : "kept"}.`;
    const lim = byId.get(e.node)?.op === "Limit";
    return lim ? `Limit has its ${byId.get(e.node)?.sim?.count} rows and says "no more". nothing below it is asked again: the rest of the table is never read.` : `${n?.op} has no more rows: EOF.`;
  };
  const nextRow = () => {
    for (let i = k; i < ev.length; i++) if (ev[i].kind === "return" && ev[i].node === plan.id) return s.go(i + 1);
    s.go(ev.length);
  };
  const outCols = Object.keys(run.output[0] ?? out[0] ?? {});
  const show = new Set<Facet>(["actual"]);
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="the executor pulling rows, one next() at a time">
      <PlanDiagram plan={plan} show={show} live={live} />
      <div className="grid gap-1.5">
        <div className="text-11 text-faint">rows the client has received</div>
        <ResultTable columns={outCols.length ? outCols : ["·"]} rows={out.map((r) => outCols.map((c) => r[c] ?? null))} rowTones={out.map((_, i) => (i === out.length - 1 && last?.kind === "return" && last.node === plan.id ? "live" : undefined))} dense footer="auto" />
      </div>
      <Narration minLines={2} tag={last ? (last.kind === "call" ? "next()" : last.kind) : "start"}>
        {describe(last)}
      </Narration>
      <div className="flex flex-wrap items-center gap-2">
        <StepControls s={s} label="call" compact={reduce} className="flex-1" />
        <button type="button" className="act" onClick={nextRow} disabled={s.atEnd}>
          to the next row
        </button>
      </div>
      <Provenance sim="model of the executor's pull loop, simplified" checked />
      {provenance != null && <div className="text-right text-[10px] text-faint">{provenance}</div>}
    </div>
  );
}

