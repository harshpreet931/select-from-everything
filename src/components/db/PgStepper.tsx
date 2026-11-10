"use client";

import { useMemo, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, ResultTable, useReducedMotion } from "@/components/figures/kit";
import type { PgTrace } from "@/lib/db/pgtrace";
import type { Page } from "@/lib/db/views";
import { fromExplainJson, traceBTree, traceChain, traceLanes, traceLocks, tracePool, traceWal } from "@/lib/db/fromTrace";
import { BTreeDiagram } from "./BTree";
import { PageDiagram, SlotList } from "./PageView";
import { PlanDiagram } from "./PlanTree";
import { PoolGrid } from "./BufferPool";
import { LaneTable, LockList } from "./SessionLanes";
import { ChainDiagram } from "./VersionChain";
import { WalCells } from "./WalStrip";

// a database you can step through: the sessions on the left, any internals you pick on the
// right, all from one real capture. what changed since the previous step is hot. most
// captured internals figures are one scenario file plus one line of mdx:
//
//   <PgStepper trace={trace} panels={["lanes", "page:accounts", "wal"]} />
//
// panels: "lanes", "page:<rel>" (block 0) or "page:<rel>:<blk>", "chain:<rel>" (or "chain:<rel>:id=1"), "btree:<index>",
// "pool", "wal", "locks", "plan", "result:<session>".

export type Panel = "lanes" | "pool" | "wal" | "locks" | "plan" | `page:${string}` | `chain:${string}` | `btree:${string}` | `result:${string}`;

/** line pointers whose tuple changed since the previous step */
function changedLps(a?: Page, b?: Page): number[] {
  if (!a || !b) return [];
  const sig = (p: Page | undefined, lp: number) => JSON.stringify(p?.tuples.find((t) => t.lp === lp) ?? null);
  return b.tuples.filter((t) => sig(a, t.lp) !== sig(b, t.lp)).map((t) => t.lp);
}

function Box({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-md bg-well px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
      {/* not an h3: inside an article the prose heading styles would win */}
      <div className="mb-2 font-mono text-11 text-faint">{title}</div>
      {children}
    </section>
  );
}

export function PgStepper({ trace, panels, start = 0, interval = 1800 }: { trace: PgTrace; panels: Panel[]; start?: number; interval?: number }) {
  const lanes = useMemo(() => traceLanes(trace), [trace]);
  const reduce = useReducedMotion();
  const s = useStepper(trace.steps.length, { interval, start });
  const i = s.i;
  const st = trace.steps[i];
  const prev = i > 0 ? trace.steps[i - 1] : undefined;
  const showLanes = panels.includes("lanes");
  const rest = panels.filter((p) => p !== "lanes");

  const panel = (p: Panel): ReactNode => {
    const [kind, arg, extra] = p.split(":");
    if (kind === "page") {
      // "page:<rel>" is block 0; "page:<rel>:<blk>" picks a block (by its number, not its position)
      const blk = extra != null && /^\d+$/.test(extra) ? Number(extra) : 0;
      const at = (h: typeof st.heap) => h?.[arg]?.find((x) => x.block === blk) ?? (blk === 0 ? h?.[arg]?.[0] : undefined);
      const pg = at(st.heap);
      if (!pg) return null;
      const hot = changedLps(at(prev?.heap), pg);
      return (
        <Box key={p} title={`${arg} · page ${blk}`}>
          <div className="grid gap-3">
            <PageDiagram page={pg} xact={st.xact} hot={hot} layout="auto" />
            <SlotList page={pg} xact={st.xact} hot={hot} />
          </div>
        </Box>
      );
    }
    if (kind === "chain") {
      const v = traceChain(trace, i, arg, extra);
      const before = prev ? traceChain(trace, i - 1, arg, extra) : undefined;
      const sig = (x?: { versions: unknown[] }) => new Map((x?.versions ?? []).map((t) => [`${(t as { block: number }).block},${(t as { lp: number }).lp}`, JSON.stringify(t)]));
      const a = sig(before);
      const hot = before ? [...sig(v).entries()].filter(([k, val]) => a.get(k) !== val).map(([k]) => k) : [];
      return (
        <Box key={p} title={`versions in ${arg}${extra ? ` where ${extra}` : ""}`}>
          <ChainDiagram view={v} hot={hot} compact />
        </Box>
      );
    }
    if (kind === "btree") {
      const v = traceBTree(trace, i, arg);
      return v ? (
        <Box key={p} title={`${arg}`}>
          <BTreeDiagram view={v} collapse={5} pageCollapse={4} />
        </Box>
      ) : null;
    }
    if (kind === "pool") {
      const v = tracePool(trace, i);
      return v ? (
        <Box key={p} title="shared buffers (pg_buffercache)">
          <PoolGrid view={v} />
        </Box>
      ) : null;
    }
    if (kind === "wal") {
      const v = traceWal(trace, i);
      return v ? (
        <Box key={p} title="WAL">
          <WalCells view={v} />
        </Box>
      ) : null;
    }
    if (kind === "locks") {
      return (
        <Box key={p} title="locks">
          <LockList locks={traceLocks(st)} />
        </Box>
      );
    }
    if (kind === "plan" && st.explain) {
      return (
        <Box key={p} title="plan">
          <PlanDiagram plan={fromExplainJson(st.explain)} show={new Set(["actual", "est", "buffers"])} />
        </Box>
      );
    }
    if (kind === "result") {
      const r = [...trace.steps.slice(0, i + 1)].reverse().find((x) => x.session === arg && x.result?.columns.length)?.result;
      return r ? (
        <Box key={p} title={`${arg}'s last result`}>
          <ResultTable columns={r.columns.map((c) => ({ name: c.name, type: c.type }))} rows={r.data} dense />
        </Box>
      ) : null;
    }
    return null;
  };

  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label={`${trace.title}, step by step`}>
      <div className={`grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] ${showLanes && rest.length ? "@min-[760px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : ""}`}>
        {showLanes && (
          <div className="min-w-0">
            <LaneTable sessions={trace.sessions} steps={lanes} cur={i} dense />
          </div>
        )}
        {rest.length > 0 && <div className="grid min-w-0 content-start gap-3 grid-cols-[minmax(0,1fr)]">{rest.map(panel)}</div>}
      </div>
      <Narration minLines={2}>{st.note}</Narration>
      <StepControls s={s} compact={reduce} />
      <Provenance trace={trace} />
    </div>
  );
}
