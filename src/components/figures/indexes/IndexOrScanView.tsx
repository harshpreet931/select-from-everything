"use client";

import { useState } from "react";
import { Chip, Legend, Narration, Provenance, Row, Words, fmt } from "@/components/figures/kit";
import { PlanDiagram } from "@/components/db/PlanTree";
import { Sql } from "@/components/figures/kit/SqlPanel";
import type { PlanNode } from "@/lib/db/views";

// the selectivity sweep: slide k < n through six points and see which scan postgres picks,
// what it guessed each of the three would cost, and how many pages each one really touched
// (Buffers: shared hit + read, every scan forced in turn). bars compare the three scans at one
// point, so each group is scaled to its own largest value. the picked scan is hot.

export type Point = {
  n: number;
  pct: number;
  scans: { scan: string; cost: number; pages: number; chosen: boolean }[];
  plan: PlanNode;
  note?: string;
};

const SHORT: Record<string, string> = { "Seq Scan": "seq scan", "Bitmap Heap Scan": "bitmap scan", "Index Scan": "index scan" };
const pctText = (p: number) => (p < 0.01 ? `${fmt(p, 3)}%` : p < 1 ? `${fmt(p, 1)}%` : `${fmt(p, 0)}%`);

function Group({ title, k, scans, unit, tone }: { title: string; k: "cost" | "pages"; scans: Point["scans"]; unit: string; tone: string }) {
  const top = Math.max(...scans.map((s) => s[k]));
  return (
    <div className="min-w-0">
      <div className="mb-2 text-11 text-faint">{title}</div>
      <div className="grid grid-cols-[11.5ch_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        {scans.map((s) => (
          <div key={s.scan} className="contents">
            <span className="text-12" style={{ color: s.chosen ? "var(--hot)" : "var(--mute)" }}>
              {SHORT[s.scan]}
            </span>
            <span className="relative h-[12px] rounded-[2px] bg-well-2">
              <span
                className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-300 ease-sfe"
                style={{
                  width: `${Math.max(0.6, (s[k] / top) * 100)}%`,
                  background: s.chosen ? "var(--hot)" : tone,
                  opacity: s.chosen ? 0.9 : 0.55,
                }}
              />
            </span>
            <span className="text-right text-12 tabular" style={{ color: s.chosen ? "var(--hi)" : "var(--mute)" }}>
              {fmt(s[k], k === "cost" ? 2 : 0)}
              <span className="text-faint"> {unit}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function IndexOrScanView({
  data,
  cols,
  rpcs,
  source,
}: {
  data: Record<string, Point[]>;
  cols: string[];
  rpcs: string[];
  source: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [col, setCol] = useState(cols[0]);
  const [rpc, setRpc] = useState(rpcs[0]);
  const points = data[`${col}|${rpc}`];
  const [i, setI] = useState(2);
  const p = points[Math.min(i, points.length - 1)];
  const pick = p.scans.find((s) => s.chosen)!;
  const seq = p.scans.find((s) => s.scan === "Seq Scan")!;
  const q = `SELECT * FROM t WHERE ${col} < ${fmt(p.n).replace(/,/g, "")};`;
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12" aria-label="one query at six selectivities: the plan postgres picks, the cost it guessed for each scan, and the pages each one touched">
      <div>
        <Row k="column =" w="18ch">
          <Words
            label="which column"
            options={cols.map((c) => ({ v: c, label: c === "k" ? "k (scattered)" : `${c} (in table order)` }))}
            value={col}
            onChange={setCol}
          />
        </Row>
        <Row k="random_page_cost =" w="18ch">
          <Words label="random_page_cost" options={rpcs.map((r) => ({ v: r, label: r === "4" ? "4 (default)" : r }))} value={rpc} onChange={setRpc} />
        </Row>
        <Row k="matches =" w="18ch" last>
          <div className="flex w-full min-w-0 items-center gap-3">
            <input
              type="range"
              className="slider min-w-0 flex-1"
              min={0}
              max={points.length - 1}
              step={1}
              value={i}
              onChange={(e) => setI(Number(e.target.value))}
              aria-label="selectivity"
              aria-valuetext={`${fmt(p.n)} rows, ${pctText(p.pct)}`}
            />
            <span className="min-w-[13ch] text-right text-12 text-hi tabular">
              {fmt(p.n)} {p.n === 1 ? "row" : "rows"} · {pctText(p.pct)}
            </span>
          </div>
        </Row>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Sql code={q} className="text-12" />
        <span className="text-faint">→</span>
        <Chip tone="hot">{pick.scan}</Chip>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 @min-[620px]:grid-cols-2">
        <Group title="estimated cost (the planner's guess)" k="cost" scans={p.scans} unit="" tone="var(--mute)" />
        <Group title="pages touched (Buffers: shared hit + read)" k="pages" scans={p.scans} unit="" tone="var(--ink)" />
      </div>
      <div className="min-w-0 rounded-md bg-well px-2 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="mb-2 px-1 text-11 text-faint">the plan postgres picked, EXPLAIN (ANALYZE, BUFFERS)</div>
        <PlanDiagram key={`${col}${rpc}${i}`} plan={p.plan} show={new Set(["actual", "buffers"])} />
      </div>
      <Narration minLines={3}>
        {p.note ? `${p.note} ` : ""}
        {pick.scan === "Seq Scan"
          ? `every scan here touches at least the ${fmt(seq.pages)} pages of the table, so postgres just reads them in order.`
          : `${SHORT[pick.scan]}: ${fmt(pick.pages)} pages touched, against ${fmt(seq.pages)} for reading the whole table.`}
      </Narration>
      <Legend
        items={[
          ["hot", "the scan postgres picked"],
          ["mute", "estimated cost, other scans"],
          ["ink", "pages touched, other scans"],
        ]}
      />
      <Provenance trace={source} />
    </div>
  );
}
