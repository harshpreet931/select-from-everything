"use client";

import { useState } from "react";
import { PlanTree } from "@/components/db/PlanTree";
import { Provenance, Row, Sql, Words } from "@/components/figures/kit";
import type { PlanNode, Table } from "@/lib/db/views";

// the executor's pull loop on a few captured plans: pick one, press next(), watch one row
// climb. each plan is a real EXPLAIN ANALYZE with volcano specs attached on the server
// (withSim), and the model's per-node row counts equal the plan's actual rows: that's what
// src/lib/db/sim/volcano.test.ts checks, for these same plans on these same 24 rows.

export type VPlan = { label: string; sql: string; plan: PlanNode; note?: string };

export function VolcanoPull({
  plans,
  tables,
  source,
}: {
  plans: VPlan[];
  tables: Record<string, Table>;
  source: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [pick, setPick] = useState(plans[0].label);
  const p = plans.find((x) => x.label === pick) ?? plans[0];
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12">
      <Row k="query =" w="8ch" last>
        <Words label="which plan" options={plans.map((x) => x.label)} value={p.label} onChange={setPick} />
      </Row>
      <div className="min-w-0 rounded-md bg-well px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
        <Sql code={p.sql} className="text-12 break-words" />
      </div>
      {p.note && <p className="font-serif text-[1.0625rem] leading-[1.6] text-ink">{p.note}</p>}
      <PlanTree key={p.label} mode="volcano" plan={p.plan} tables={tables} provenance={<Provenance trace={source} />} />
    </div>
  );
}
