"use client";

import { useState } from "react";
import { Bars } from "@/components/viz/Bars";
import { Provenance, Row, Words, NARR } from "@/components/figures/kit";
import { LATCH_SAMPLES } from "./latchSamples";

// which wait events 32 busy backends were in, per workload, sampled from pg_stat_activity on a
// native server (see latchSamples.ts for the method). LWLock waits are hot: they're the point.

const LABEL: Record<string, string> = {
  "one-row-update": "32 × UPDATE one row",
  "one-row-select": "32 × SELECT one row",
  "append-insert": "32 × INSERT, one table",
};

export function WaitSamples({ top = 8 }: { top?: number }) {
  const [w, setW] = useState(LATCH_SAMPLES[0].workload);
  const s = LATCH_SAMPLES.find((x) => x.workload === w)!;
  const total = Object.values(s.counts).reduce((a, b) => a + b, 0);
  const rows = Object.entries(s.counts).sort((a, b) => b[1] - a[1]);
  const shown = rows.slice(0, top);
  const rest = rows.length - shown.length;
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="workload =" w="11ch" last>
        <Words label="workload" options={LATCH_SAMPLES.map((x) => ({ v: x.workload, label: LABEL[x.workload] ?? x.workload }))} value={w} onChange={setW} />
      </Row>
      <div className="font-mono text-11 text-faint">
        <code className="text-hi">{s.sql}</code> · {s.tps.toLocaleString("en-US")} tps · {s.samples} samples
      </div>
      <Bars
        key={w}
        unit="%"
        data={shown.map(([k, v]) => ({
          label: k === "running:(cpu)" ? "running (no wait)" : k,
          value: Math.round((v / total) * 1000) / 10,
          tone: k.startsWith("LWLock:") ? "hot" : k.startsWith("Lock:") ? "meta" : undefined,
        }))}
      />
      <p className={NARR}>
        share of backend samples in each state.{rest > 0 ? ` ${rest} rarer events left out.` : ""} <span style={{ color: "var(--hot)" }}>LWLock</span> waits are latches;{" "}
        <span style={{ color: "var(--meta)" }}>Lock</span> waits are heavyweight locks, the ones pg_locks shows. Timeout:SpinDelay is a backend sleeping between tries for a spinlock.
      </p>
      <Provenance measured="on this mac (m4 pro, 14 cores), postgres 18.6 from Postgres.app, pgbench -c 32 -j 8, pg_stat_activity sampled every 10 ms for 5 s. one run; the numbers move between runs, the order doesn't" />
    </div>
  );
}
