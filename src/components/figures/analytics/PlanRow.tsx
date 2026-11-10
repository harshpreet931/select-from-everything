"use client";

import { useState } from "react";
import { Provenance, SqlPanel, Toggle, ring } from "@/components/figures/kit";

// a few plans for the same question, side by side, as small trees of nodes (data flows up).
// each plan is the text of a captured EXPLAIN (COSTS OFF); this only splits it into nodes and
// their detail lines. "the full text" shows the plans exactly as postgres printed them.

type Plan = { sql: string; note?: string; plan: string };
type Node = { depth: number; op: string; details: string[] };

function parse(text: string): Node[] {
  const out: Node[] = [];
  text.split("\n").forEach((line, i) => {
    const m = /^(\s*)->\s+(.*)$/.exec(line);
    if (i === 0) out.push({ depth: 0, op: line.trim(), details: [] });
    else if (m) out.push({ depth: Math.round((m[1].length - 2) / 6) + 1, op: m[2].trim(), details: [] });
    else if (line.trim() && out.length) out[out.length - 1].details.push(line.trim());
  });
  return out;
}

export function PlanRow({
  plans,
  order,
  rows,
  trace,
}: {
  plans: Record<string, Plan>;
  order: string[];
  /** a line under each plan's name: "11 rows" */
  rows?: Record<string, string>;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [full, setFull] = useState(false);
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="query plans side by side">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @min-[700px]:grid-cols-3">
        {order.map((k) => {
          const p = plans[k];
          const nodes = parse(p.plan);
          return (
            <div key={k} className="min-w-0 rounded-md bg-well px-3 pt-2 pb-3 shadow-[inset_0_0_0_1px_var(--line)]">
              <div className="flex items-baseline justify-between gap-2 border-b border-line pb-1.5">
                <span className="text-12 text-hi">{k}</span>
                {rows?.[k] && <span className="text-11 text-faint tabular">{rows[k]}</span>}
              </div>
              <ol className="mt-2 grid gap-1.5" aria-label={`the plan for ${k}`}>
                {nodes.map((n, i) => (
                  <li key={i} className="min-w-0" style={{ paddingLeft: `${Math.min(n.depth, 5) * 10}px` }}>
                    <div className="min-w-0 rounded-xs bg-well px-2 py-1" style={{ boxShadow: ring("line-2") }}>
                      <div className="truncate text-12 text-hi" title={n.op}>
                        {n.depth > 0 && <span className="mr-1 text-faint">↑</span>}
                        {n.op}
                      </div>
                      {n.details.map((d, j) => (
                        <div key={j} className="truncate text-11 leading-[1.5] text-faint" title={d}>
                          {d}
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
              {p.note && <p className="mt-2.5 font-serif text-[0.95rem] leading-[1.5] text-ink">{p.note}</p>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-12">
        <Toggle on={full} onChange={setFull}>
          the full text
        </Toggle>
      </div>
      {full && (
        <div className="grid gap-3">
          {order.map((k) => (
            <SqlPanel key={k} code={plans[k].plan} lang="plan" file={`EXPLAIN (COSTS OFF): ${k}`} nolines />
          ))}
        </div>
      )}
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
