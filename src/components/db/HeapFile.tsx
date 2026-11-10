"use client";

import { useMemo } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, Provenance, fmt, tint, useReducedMotion } from "@/components/figures/kit";
import { StepSql } from "./StepSql";
import type { HeapFileView, Source } from "@/lib/db/views";
import { stepsOf, traceOf } from "./source";
import { heapFileFromTrace } from "@/lib/db/fromTrace";
import { describeHeapFile } from "@/lib/db/describe";

// a table as its pages: each bar is one 8 KB page, live tuples at the bottom (live), dead
// tuples above them (dead, ghosted), free space on top (dashed). under each page its two
// visibility map bits (meta): all-visible and all-frozen. delete two rows in three and the
// file doesn't shrink: the dead rows sit there until vacuum turns them into free space, and
// only VACUUM FULL writes a smaller file.
//
//   <HeapFile steps={stages.map((s) => ({ view: { rel: "events", pages: s.pages }, label: s.label }))} />
//   <HeapFile trace={trace} select="accounts" />


export function HeapBars({ view, maxPages }: { view: HeapFileView; maxPages?: number }) {
  const size = view.size ?? 8192;
  const n = Math.max(view.pages.length, maxPages ?? 0);
  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="flex min-w-max items-end gap-[3px]" role="img" aria-label={describeHeapFile(view)}>
        {Array.from({ length: n }, (_, i) => {
          const p = view.pages[i];
          if (!p)
            return (
              <div key={i} className="flex w-[22px] flex-col items-center gap-1 opacity-40">
                <div className="h-[92px] w-full rounded-[3px]" style={{ outline: "1px dashed var(--line-2)", outlineOffset: -1 }} />
                <span className="text-[9px] text-faint">·</span>
                <span className="h-[14px]" />
              </div>
            );
          const pct = (b: number) => `${(b / size) * 100}%`;
          const header = Math.max(0, size - p.used - p.dead - p.free);
          return (
            <div key={i} className="flex w-[22px] flex-col items-center gap-1" title={`block ${p.block}: ${fmt(p.used)} B live, ${fmt(p.dead)} B dead, ${fmt(p.free)} B free`}>
              <div className="relative flex h-[92px] w-full flex-col-reverse overflow-hidden rounded-[3px]" style={{ boxShadow: "inset 0 0 0 1px var(--line-2)" }}>
                <span style={{ height: pct(header), background: tint("meta", 30) }} />
                <span className="transition-[height] duration-300 ease-sfe" style={{ height: pct(p.used), background: "color-mix(in srgb, var(--live) 38%, transparent)", boxShadow: "inset 0 1px 0 var(--live)" }} />
                <span className="transition-[height] duration-300 ease-sfe" style={{ height: pct(p.dead), background: tint("dead", 22), outline: p.dead ? "1px dashed var(--dead)" : undefined, outlineOffset: -1 }} />
                <span className="transition-[height] duration-300 ease-sfe" style={{ height: pct(p.free) }} />
              </div>
              <span className="text-[9px] text-faint tabular">{p.block}</span>
              <span className="flex gap-[3px]" aria-label={`${p.allVisible ? "all-visible" : "not all-visible"}, ${p.allFrozen ? "all-frozen" : "not all-frozen"}`}>
                <span className="size-[6px] rounded-full" title="all-visible" style={{ background: p.allVisible ? "var(--meta)" : "transparent", boxShadow: "inset 0 0 0 1px var(--meta)" }} />
                <span className="size-[6px] rounded-[1px]" title="all-frozen" style={{ background: p.allFrozen ? "var(--meta)" : "transparent", boxShadow: "inset 0 0 0 1px var(--meta)" }} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HeapFile(props: Source<HeapFileView>) {
  const trace = traceOf(props);
  const steps = useMemo(
    () => stepsOf(props, (t, i, sel) => heapFileFromTrace(t, i, sel ?? Object.keys(t.rels).find((r) => t.rels[r].kind === "table") ?? "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ["view" in props ? props.view : null, "steps" in props ? props.steps : null, "trace" in props ? props.trace : null],
  );
  const reduce = useReducedMotion();
  const s = useStepper(Math.max(1, steps.length), { interval: 1600 });
  const cur = steps[Math.min(s.i, steps.length - 1)];
  const maxPages = Math.max(...steps.map((x) => x.view.pages.length));
  if (!cur) return null;
  const v = cur.view;
  const sum = (f: (p: HeapFileView["pages"][number]) => number) => v.pages.reduce((a, p) => a + f(p), 0);
  const size = (v.size ?? 8192) * v.pages.length;
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label={`${v.rel}, page by page`}>
      {cur.label && steps.length > 1 ? (
        trace ? (
          <StepSql label={cur.label} />
        ) : (
          <div className="text-12 text-hi" aria-live="polite">
            {cur.label}
          </div>
        )
      ) : null}
      <HeapBars view={v} maxPages={maxPages} />
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-11 text-mute tabular">
        <span>
          file <span className="text-hi">{fmt(v.pages.length)} pages</span> ({fmt(size / 1024)} KB)
        </span>
        <span>
          live <span className="text-live">{fmt(sum((p) => p.used))} B</span>
        </span>
        <span>
          dead <span className="text-dead">{fmt(sum((p) => p.dead))} B</span>
        </span>
        <span>
          free <span className="text-hi">{fmt(sum((p) => p.free))} B</span>
        </span>
      </div>
      {cur.note ? <Narration minLines={2}>{cur.note}</Narration> : null}
      <Legend
        items={[
          ["live", "live tuples"],
          ["dead", "dead tuples", "ghost"],
          ["mute", "free space", "dashed"],
          ["meta", "page header, VM bits (● all-visible, ■ all-frozen)"],
        ]}
      />
      {steps.length > 1 && <StepControls s={s} compact={reduce} />}
      {trace ? <Provenance trace={trace} /> : null}
    </div>
  );
}
