"use client";

import { useState } from "react";
import { Narration, Provenance, Row, SqlPanel, Stat, Words, fmt, ring, tint } from "@/components/figures/kit";

// a hash join's two inputs split into batches by the hash of the join key. batch 0 is joined
// in memory right away; every other batch of both sides goes to a temp file and is joined
// later, one batch at a time, reading its build half back into a fresh hash table. pick a
// work_mem and watch the batches multiply. the numbers are all from the captured plans.

export type SpillRun = {
  label: string;
  sql: string;
  plan: string;
  note?: string;
  buckets: number;
  batches: number;
  memKB: number;
  limitKB: number;
  tempRead: number;
  tempWritten: number;
  buildWritten: number;
  buildRows: number;
  probeRows: number;
  hot: number[];
};

const kb = (v: number) => (v >= 1024 ? `${fmt(v / 1024, v % 1024 ? 1 : 0)}MB` : `${fmt(v)}kB`);

function Lane({ name, rows, batches, side }: { name: string; rows: number; batches: number; side: "build" | "probe" }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-11">
        <span className="text-ink">
          {side === "build" ? "build" : "probe"}: <span className="text-hi">{name}</span>
        </span>
        <span className="text-faint tabular">{fmt(rows)} rows</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: batches }, (_, b) => (
          <div
            key={b}
            className="flex h-10 min-w-0 flex-1 flex-col items-center justify-center rounded-xs text-[10px] leading-3 transition-[background-color,box-shadow] duration-300 ease-sfe"
            style={
              b === 0
                ? { boxShadow: ring("hi", undefined, 1.5), background: tint("live", 10) }
                : { outline: "1px dashed var(--hot)", outlineOffset: -1, background: tint("hot", 6) }
            }
            title={b === 0 ? `batch 0: ${side === "build" ? "hashed in memory" : "probed straight away"}` : `batch ${b}: written to a temp file, ${side === "build" ? "hashed" : "probed"} later`}
          >
            <span className="text-hi">{b}</span>
            {batches <= 4 && <span className="text-faint">{b === 0 ? (side === "build" ? "in memory" : "probed now") : "temp file"}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HashSpillView({
  runs,
  build,
  probe,
  source,
}: {
  runs: SpillRun[];
  build: string;
  probe: string;
  source: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [pick, setPick] = useState(runs[0].label);
  const r = runs.find((x) => x.label === pick) ?? runs[0];
  const tallest = Math.max(...runs.map((x) => x.plan.split("\n").length));
  const over = r.memKB > r.limitKB;
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12" aria-label="a hash join splitting into batches as work_mem shrinks">
      <Row k="work_mem =" w="11ch" last>
        <Words label="work_mem" options={runs.map((x) => x.label)} value={r.label} onChange={setPick} />
      </Row>
      <div className="grid grid-cols-2 gap-3 @min-[560px]:grid-cols-4">
        <Stat k="batches" v={fmt(r.batches)} tone={r.batches > 1 ? "hot" : undefined} />
        <Stat k="buckets" v={fmt(r.buckets)} />
        <Stat k="hash table" v={`${kb(r.memKB)} / ${kb(r.limitKB)}`} />
        <Stat k="temp pages written" v={r.tempWritten ? `${fmt(r.tempWritten)} (${kb(r.tempWritten * 8)})` : "0"} tone={r.tempWritten ? "hot" : undefined} />
      </div>
      <div className="grid min-w-0 gap-3 rounded-md px-3 py-3 shadow-[inset_0_0_0_1px_var(--line)]" role="img" aria-label={`${r.batches} batches. batch 0 of both sides is joined in memory${r.batches > 1 ? `; the other ${r.batches - 1} go to temp files and are joined one at a time afterwards` : ""}`}>
        <Lane name={build} rows={r.buildRows} batches={r.batches} side="build" />
        <Lane name={probe} rows={r.probeRows} batches={r.batches} side="probe" />
        <div className="text-11 text-faint">
          {r.batches === 1
            ? "one batch: the whole build side is one hash table, and the probe side streams past it once."
            : `each row goes to batch hash(key) mod ${r.batches}. ${build} wrote ${fmt(r.buildWritten)} temp pages, ${probe} the other ${fmt(r.tempWritten - r.buildWritten)}; every one of them is read back later.`}
        </div>
      </div>
      <div style={{ minHeight: `${tallest * 1.75 * 13 + 52}px` }}>
        <SqlPanel code={r.plan} lang="plan" file="what postgres printed" hot={r.hot} nolines />
      </div>
      <Narration minLines={2}>
        {r.note}
        {over ? ` the table still peaked at ${kb(r.memKB)}, over the ${kb(r.limitKB)} limit: the limit steers the batch count, it isn't a hard cap.` : ""}
      </Narration>
      <Provenance trace={source} />
    </div>
  );
}
