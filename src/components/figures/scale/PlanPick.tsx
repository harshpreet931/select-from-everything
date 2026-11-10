"use client";

import { useState } from "react";
import { Narration, Provenance, Row, SqlPanel, Words } from "@/components/figures/kit";

// a few captured text plans (EXPLAIN VERBOSE output, one row per line) behind a switch, shown
// whole and indented the way psql prints them. RunPick's result grid trims long plan lines,
// and with Remote SQL the end of the line is the point.

export function PlanPick({
  runs,
  trace,
  hot = [],
}: {
  runs: { label: string; sql: string; plan: string; note?: string }[];
  trace: { engine?: { version?: string; build?: string }; scenario?: string };
  hot?: string[];
}) {
  const [pick, setPick] = useState(runs[0].label);
  const r = runs.find((x) => x.label === pick) ?? runs[0];
  const lines = r.plan.split("\n");
  const marks = lines.map((l, i) => (hot.some((h) => l.includes(h)) ? i + 1 : 0)).filter(Boolean);
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="query =" w="8ch" last>
        <Words label="query" options={runs.map((x) => x.label)} value={pick} onChange={setPick} />
      </Row>
      <SqlPanel code={r.sql} nolines wrap />
      <div className="w-0 min-w-full overflow-x-auto">
        <SqlPanel code={r.plan} lang="plan" nolines hot={marks} file="QUERY PLAN" />
      </div>
      {r.note && <Narration>{r.note}</Narration>}
      <Provenance trace={trace} />
    </div>
  );
}
