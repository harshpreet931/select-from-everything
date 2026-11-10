"use client";

import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, SqlPanel, fmt, ring, tint, useReducedMotion } from "@/components/figures/kit";

// the stages a query passes through, one at a time: what each one gets, what it hands on, and
// a trimmed slice of the tree the server logged for it. the current stage is hot in the strip.

export type Stage = { id: string; label: string; sub: string; note: string; code: string; lang: "sql" | "text"; kept?: number; of?: number };

export function LifecycleStagesView({ stages, source }: { stages: Stage[]; source: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const reduce = useReducedMotion();
  const s = useStepper(stages.length, { interval: 2600 });
  const st = stages[s.i];
  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12 outline-none" aria-label="a query going through the parser, analyzer, rewriter, planner and executor">
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="stages">
        {stages.map((x, i) => (
          <li key={x.id} className="flex items-center gap-1.5">
            <button
              type="button"
              className="rounded-xs px-2 py-0.5 text-11 transition-[box-shadow,background-color,color] duration-200 ease-sfe"
              style={{ boxShadow: i === s.i ? ring("hot", undefined, 1.5) : ring("line-2"), background: i === s.i ? tint("hot", 8) : undefined, color: i === s.i ? "var(--hi)" : i < s.i ? "var(--ink)" : "var(--mute)" }}
              onClick={() => s.go(i)}
              aria-pressed={i === s.i}
            >
              {x.label}
            </button>
            {i < stages.length - 1 && <span className="text-faint">→</span>}
          </li>
        ))}
      </ol>
      <div className="text-11 text-faint">{st.sub}</div>
      <div className="min-w-0">
        <SqlPanel
          code={st.code}
          lang={st.lang}
          file={st.lang === "sql" ? "query.sql" : st.id === "executor" ? "the result" : "from the server log"}
          right={st.kept ? `${fmt(st.kept)} of ${fmt(st.of ?? 0)} lines` : undefined}
          nolines
        />
      </div>
      <Narration minLines={3} tag={st.label}>
        {st.note}
      </Narration>
      <StepControls s={s} label="stage" compact={reduce} />
      <Provenance trace={source} />
    </div>
  );
}
