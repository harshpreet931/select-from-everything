"use client";

import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, fmt, tint, useReducedMotion } from "@/components/figures/kit";
import { LaneTable } from "@/components/db/SessionLanes";
import type { SessionStep } from "@/lib/db/views";

// sessions on the left, the table's pages on the right, one stepper. each page bar: live tuples
// at the bottom, then deleted tuples an open snapshot still needs (dead, dashed: not yet
// removable), then tuples nobody needs (dead ghost: removable), then free space. the chip says
// where the horizon is. when a step ran VACUUM VERBOSE, its two telling lines sit underneath.

export type HorizonMoment = {
  horizon: number;
  pages: { block: number; live: number; held: number; gone: number; free: number }[];
  log: string[];
};

export function LongTxnView({ sessions, lanes, moments, size, source }: { sessions: string[]; lanes: SessionStep[]; moments: HorizonMoment[]; size: number; source: string }) {
  const s = useStepper(moments.length, { interval: 2400 });
  const reduce = useReducedMotion();
  const m = moments[s.i];
  const sum = (k: "live" | "held" | "gone" | "free") => m.pages.reduce((a, p) => a + p[k], 0);
  const pct = (b: number) => `${(b / size) * 100}%`;
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="an open snapshot and vacuum, step by step">
      <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[760px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0">
          <LaneTable sessions={sessions} steps={lanes} cur={s.i} dense />
        </div>
        <section className="grid min-w-0 content-start gap-3 rounded-md bg-well px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]" aria-label="the table's pages">
          <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-11 text-faint">
            <span>t, page by page</span>
            <span className="text-meta">oldest xmin anyone needs: {m.horizon}</span>
          </div>
          <div className="flex items-end gap-3" role="img" aria-label={`${fmt(sum("live"))} bytes live, ${fmt(sum("held"))} bytes dead but not yet removable, ${fmt(sum("gone"))} bytes removable`}>
            {m.pages.map((p) => (
              <div key={p.block} className="flex w-10 flex-col items-center gap-1">
                <div className="relative flex h-[120px] w-full flex-col-reverse overflow-hidden rounded-[3px]" style={{ boxShadow: "inset 0 0 0 1px var(--line-2)" }}>
                  <span className="transition-[height] duration-300 ease-sfe" style={{ height: pct(p.live), background: "color-mix(in srgb, var(--live) 38%, transparent)", boxShadow: "inset 0 1px 0 var(--live)" }} />
                  <span
                    className="transition-[height] duration-300 ease-sfe"
                    style={{ height: pct(p.held), background: tint("dead", 10), outline: p.held ? "1.5px dashed var(--dead)" : undefined, outlineOffset: -2 }}
                  />
                  <span className="transition-[height] duration-300 ease-sfe" style={{ height: pct(p.gone), background: tint("dead", 30), opacity: 0.6 }} />
                </div>
                <span className="text-[9px] text-faint tabular">page {p.block}</span>
              </div>
            ))}
            <div className="grid gap-1 pb-4 text-11 text-mute tabular">
              <span>
                live <span className="text-live">{fmt(sum("live"))} B</span>
              </span>
              <span>
                not yet removable <span className="text-dead">{fmt(sum("held"))} B</span>
              </span>
              <span>
                removable <span className="text-dead">{fmt(sum("gone"))} B</span>
              </span>
              <span>
                free <span className="text-hi">{fmt(sum("free"))} B</span>
              </span>
            </div>
          </div>
          <div className="min-h-[2.8em] font-mono text-11 leading-[1.6] text-ink">
            {m.log.length ? (
              m.log.map((l) => (
                <div key={l} className={/dead but not yet removable/.test(l) && !/ 0 are dead/.test(l) ? "text-dead" : undefined}>
                  {l}
                </div>
              ))
            ) : (
              <span className="text-faint">no VACUUM in this step.</span>
            )}
          </div>
        </section>
      </div>
      <Narration minLines={2}>{lanes[s.i]?.note}</Narration>
      <Legend
        items={[
          ["live", "live tuples"],
          ["dead", "dead, not yet removable", "dashed"],
          ["dead", "dead, removable", "ghost"],
          ["meta", "the horizon"],
        ]}
      />
      <StepControls s={s} compact={reduce} />
      <div className="text-right text-[10px] leading-4 text-faint">{source}</div>
    </div>
  );
}
