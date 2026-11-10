"use client";

import { useState } from "react";
import { Narration, Provenance, Row, Words } from "@/components/figures/kit";
import { SqlPanel } from "@/components/figures/kit/SqlPanel";

// pick a set of planner settings, see the captured text plan for it. the top node's total cost
// is drawn as a bar against every option's, so "how much worse does postgres think this is"
// reads at a glance. lines saying Disabled are dead, the top line is hot.

export type SwitchRun = { key: string; sets: string[]; plan: string; cost: number; note: string };

export function SwitchPlansView({ runs, k, source }: { runs: SwitchRun[]; k: string; source: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const [key, setKey] = useState(runs[0].key);
  const run = runs.find((r) => r.key === key)!;
  const top = Math.max(...runs.map((r) => r.cost));
  const lines = run.plan.split("\n");
  const dead = lines.flatMap((l, i) => (/Disabled: true/.test(l) ? [i + 1] : []));
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12" aria-label="one query under different planner settings, and the plan each one gets">
      <Row k={`${k} =`} w={`${k.length + 3}ch`} last>
        <Words label={k} options={runs.map((r) => r.key)} value={key} onChange={setKey} />
      </Row>
      <div className="min-w-0 rounded-md bg-well px-3 py-2 text-12 text-ink shadow-[inset_0_0_0_1px_var(--line)]" style={{ minHeight: "4.6em" }}>
        {run.sets.length ? run.sets.map((s) => <div key={s}>{s}</div>) : <div className="text-faint">-- every enable_* setting at its default (on)</div>}
      </div>
      <div className="w-0 min-w-full" style={{ minHeight: `${Math.max(...runs.map((r) => r.plan.split("\n").length)) * 1.7 + 2.5}em` }}>
        <SqlPanel code={run.plan} lang="plan" file="EXPLAIN" hot={[1]} dead={dead} nolines />
      </div>
      <div className="grid grid-cols-[12ch_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        {runs.map((r) => (
          <div key={r.key} className="contents">
            <span className="truncate text-12" style={{ color: r.key === key ? "var(--hot)" : "var(--mute)" }}>
              {r.key}
            </span>
            <span className="relative h-[10px] rounded-[2px] bg-well-2">
              <span className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-300 ease-sfe" style={{ width: `${(r.cost / top) * 100}%`, background: r.key === key ? "var(--hot)" : "var(--mute)", opacity: r.key === key ? 0.9 : 0.45 }} />
            </span>
            <span className="text-right text-12 tabular" style={{ color: r.key === key ? "var(--hi)" : "var(--mute)" }}>
              {r.cost.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <Narration minLines={2}>{run.note}</Narration>
      <Provenance trace={source} />
    </div>
  );
}
