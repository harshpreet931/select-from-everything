"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, Row, SqlPanel, Words, fmt, ring, tint } from "@/components/figures/kit";

// which partitions a query reads, read off its real EXPLAIN (ANALYZE, FORMAT JSON). the mdx
// derives each partition's fate from the plan on the server (pruneOf in partitioning.mdx):
//   plan     not in the plan at all: pruned while planning
//   init     in the plan, but counted in "Subplans Removed": pruned when the executor started
//   never    in the plan and started, but "(never executed)": pruned while running
//   scanned  read, with its actual rows

export type Fate = "plan" | "init" | "never" | "scanned";
export type PruneRun = { label: string; sql: string; note: string; fate: Record<string, Fate>; rows: Record<string, number> };

const SAY: Record<Fate, string> = {
  plan: "pruned while planning",
  init: "pruned at executor start",
  never: "never executed",
  scanned: "read",
};

export function PruneStrip({
  parts,
  runs,
  trace,
}: {
  parts: { name: string; rows: number; label: string }[];
  runs: PruneRun[];
  trace: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [pick, setPick] = useState(runs[0].label);
  const run = runs.find((r) => r.label === pick) ?? runs[0];
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="WHERE =" w="8ch" last>
        <Words label="query" options={runs.map((r) => r.label)} value={pick} onChange={setPick} />
      </Row>
      <SqlPanel code={run.sql} nolines wrap />
      <div className="grid grid-cols-3 gap-2" role="img" aria-label={parts.map((p) => `${p.name}: ${SAY[run.fate[p.name]]}`).join(", ")}>
        {parts.map((p) => {
          const f = run.fate[p.name];
          const read = f === "scanned";
          return (
            <div
              key={p.name}
              className="min-w-0 rounded-md px-2 py-2 transition-[box-shadow,background-color,opacity] duration-200 ease-sfe"
              style={{
                boxShadow: read ? ring("hot", undefined, 1.5) : f === "never" ? undefined : ring("line"),
                outline: f === "never" ? "1px dashed var(--mute)" : undefined,
                outlineOffset: -1,
                background: read ? tint("hot", 8) : "var(--well)",
                opacity: f === "plan" ? 0.45 : 1,
              }}
            >
              <div className="truncate text-hi">{p.label}</div>
              <div className="text-[10.5px] leading-4 text-faint">{p.name} · {fmt(p.rows)} rows</div>
              <div className="mt-1.5 text-11" style={{ color: read ? "var(--hot)" : "var(--mute)", textDecoration: f === "plan" || f === "init" ? "line-through" : undefined }}>
                {SAY[f]}
              </div>
              {read && <div className="text-11 tabular text-hi">{fmt(run.rows[p.name] ?? 0)} matched</div>}
            </div>
          );
        })}
      </div>
      <Narration>{run.note}</Narration>
      <Legend items={[["hot", "read"], ["mute", "started, never executed", "dashed"], ["faint", "pruned (struck)", "ghost"]]} />
      <Provenance trace={trace} />
    </div>
  );
}
