"use client";

import { useMemo } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, Provenance, Stat, fmt, ring, useReducedMotion } from "@/components/figures/kit";
import { Sql } from "@/components/figures/kit/SqlPanel";
import { PlanDiagram } from "@/components/db/PlanTree";
import type { PlanNode } from "@/lib/db/views";

// one table's visibility map, one square per heap page (meta filled = all-visible), stepped
// through the statements of a capture. a query step shows its plan and the two numbers that
// matter: Heap Fetches and pages read. squares whose bit changed at this step are ringed hot.

export type Moment = { sql: string; note?: string; vm: boolean[]; plan?: PlanNode; scan?: string; heapFetches?: number; pages?: number };

export function IndexOnlyView({ moments, rel, source }: { moments: Moment[]; rel: string; source: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const reduce = useReducedMotion();
  const s = useStepper(moments.length, { interval: 2200 });
  const m = moments[Math.min(s.i, moments.length - 1)];
  const prev = s.i > 0 ? moments[s.i - 1] : undefined;
  const changed = useMemo(() => new Set(m.vm.map((v, i) => (prev && prev.vm[i] !== v ? i : -1)).filter((i) => i >= 0)), [m, prev]);
  const visible = m.vm.filter(Boolean).length;
  const facets = useMemo(() => new Set<"actual" | "buffers">(["actual", "buffers"]), []);
  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12 outline-none" aria-label="the visibility map and an index-only scan, statement by statement">
      <div className="min-w-0">
        <Sql code={m.sql} className="text-12 break-words" />
      </div>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-11 text-faint">
          <span>
            the visibility map of {rel}: one square per heap page
          </span>
          <span className="tabular">
            all-visible <span className="text-hi">{fmt(visible)}</span> of {fmt(m.vm.length)}
          </span>
        </div>
        <div className="flex flex-wrap gap-[3px]" role="img" aria-label={`${visible} of ${m.vm.length} pages all-visible`}>
          {m.vm.map((v, i) => (
            <span
              key={i}
              title={`page ${i}: ${v ? "all-visible" : "not all-visible"}`}
              className="size-[10px] rounded-[2px] transition-[background-color,box-shadow] duration-300 ease-sfe"
              style={{
                background: v ? "var(--meta)" : "transparent",
                boxShadow: changed.has(i) ? ring("hot", undefined, 2) : ring("meta", 55),
              }}
            />
          ))}
        </div>
      </div>
      {m.plan ? (
        <>
          <div className="flex flex-wrap gap-x-7 gap-y-2">
            <Stat k="scan" v={m.scan} />
            {m.heapFetches !== undefined && <Stat k="Heap Fetches" v={fmt(m.heapFetches)} tone={m.heapFetches > 0 ? "hot" : "live"} />}
            <Stat k="pages read (Buffers)" v={fmt(m.pages ?? 0)} />
          </div>
          <div className="min-w-0 rounded-md bg-well px-2 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
            <PlanDiagram key={s.i} plan={m.plan} show={facets} />
          </div>
        </>
      ) : (
        <div className="text-11 text-faint">{changed.size ? `${fmt(changed.size)} ${changed.size === 1 ? "page" : "pages"} changed bit at this step.` : "no plan at this step."}</div>
      )}
      <Narration minLines={2}>{m.note}</Narration>
      <Legend
        items={[
          ["meta", "all-visible page"],
          ["meta", "not all-visible", "ghost"],
          ["hot", "bit changed at this step", "dashed"],
        ]}
      />
      <StepControls s={s} compact={reduce} />
      <Provenance trace={source} />
    </div>
  );
}
