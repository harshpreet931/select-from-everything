"use client";

import { useState } from "react";
import { Legend, Provenance, Row, Stat, Words, tint, useWidth } from "@/components/figures/kit";

// the shape of io_method = sync vs worker, as a toy schedule: eight pages, each read takes
// `read` units of time, each page takes 1 unit to process. sync: the backend asks for a page,
// waits, processes it, asks for the next. worker: a read stream asks for pages ahead (up to 4
// in flight), three io workers do the reads, and the backend processes each page as soon as
// it's there. the units are made up. it shows where the waiting goes, not how fast your disk is.

type Bar = { lane: number; from: number; to: number; kind: "read" | "work" | "wait"; page: number };

function schedule(mode: "sync" | "worker", read: number, n = 8, ahead = 4, workers = 3): { bars: Bar[]; total: number; lanes: string[] } {
  const bars: Bar[] = [];
  if (mode === "sync") {
    let t = 0;
    for (let i = 0; i < n; i++) {
      bars.push({ lane: 0, from: t, to: t + read, kind: "wait", page: i });
      bars.push({ lane: 1, from: t, to: t + read, kind: "read", page: i });
      t += read;
      bars.push({ lane: 0, from: t, to: t + 1, kind: "work", page: i });
      t += 1;
    }
    return { bars, total: t, lanes: ["backend", "the read (same process)"] };
  }
  const free = Array(workers).fill(0);
  const done: number[] = [];
  const procEnd: number[] = [];
  let backend = 0;
  for (let i = 0; i < n; i++) {
    const issued = i < ahead ? 0 : procEnd[i - ahead];
    const w = free.indexOf(Math.min(...free));
    const start = Math.max(issued, free[w]);
    free[w] = start + read;
    done[i] = start + read;
    bars.push({ lane: 1 + w, from: start, to: start + read, kind: "read", page: i });
    const ps = Math.max(done[i], backend);
    if (ps > backend) bars.push({ lane: 0, from: backend, to: ps, kind: "wait", page: i });
    bars.push({ lane: 0, from: ps, to: ps + 1, kind: "work", page: i });
    backend = ps + 1;
    procEnd[i] = backend;
  }
  return { bars, total: backend, lanes: ["backend", ...Array.from({ length: workers }, (_, k) => `io worker ${k}`)] };
}

export function SyncVsAsync() {
  const [mode, setMode] = useState<"sync" | "worker">("worker");
  const [read, setRead] = useState(4);
  const [wrap, w] = useWidth<HTMLDivElement>(640);
  const sync = schedule("sync", read);
  const cur = schedule(mode, read);
  const W = Math.max(300, w);
  const narrow = W < 480;
  const labelW = narrow ? 66 : 104;
  const scale = (W - labelW - 8) / Math.max(sync.total, 1);
  const laneH = 26;
  const H = cur.lanes.length * laneH + 22;
  return (
    <div ref={wrap} className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="io_method =" w="15ch">
          <Words label="io_method" options={[{ v: "sync", label: "sync" }, { v: "worker", label: "worker" }] as { v: "sync" | "worker"; label: string }[]} value={mode} onChange={setMode} />
        </Row>
        <Row k="a read takes =" w="15ch" last>
          <Words label="how long one read takes" options={[{ v: 4, label: "4 units (a slow disk)" }, { v: 1, label: "1 unit" }, { v: 0.25, label: "¼ unit (OS cache)" }]} value={read} onChange={setRead} />
        </Row>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={`${mode}: eight pages done after ${cur.total} units`}>
        {cur.lanes.map((l, i) => (
          <g key={l}>
            <text x={0} y={i * laneH + 17} fontSize={10.5} fill="var(--mute)">
              {narrow ? l.replace("io worker", "worker").replace("the read (same process)", "the read") : l}
            </text>
            <line x1={labelW} x2={W} y1={i * laneH + laneH - 1} y2={i * laneH + laneH - 1} stroke="var(--line)" />
          </g>
        ))}
        {cur.bars.map((b, i) => {
          const x = labelW + b.from * scale;
          const wd = Math.max(1.5, (b.to - b.from) * scale - 1.5);
          const y = b.lane * laneH + 5;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={wd}
                height={laneH - 10}
                rx={3}
                fill={b.kind === "read" ? tint("hot", 16) : b.kind === "work" ? "var(--well-2)" : "none"}
                stroke={b.kind === "read" ? "var(--hot)" : b.kind === "work" ? "var(--ink)" : "var(--mute)"}
                strokeOpacity={b.kind === "work" ? 0.6 : 1}
                strokeDasharray={b.kind === "wait" ? "3 3" : undefined}
              />
              {wd > 14 && b.kind !== "wait" && (
                <text x={x + wd / 2} y={y + 11} textAnchor="middle" fontSize={9.5} fill={b.kind === "read" ? "var(--hot)" : "var(--ink)"}>
                  {b.page}
                </text>
              )}
            </g>
          );
        })}
        <line x1={labelW + cur.total * scale} x2={labelW + cur.total * scale} y1={0} y2={H - 16} stroke="var(--hi)" strokeDasharray="2 2" />
        <text x={Math.min(W - 4, labelW + cur.total * scale)} y={H - 4} textAnchor={labelW + cur.total * scale > W - 60 ? "end" : "middle"} fontSize={10} fill="var(--hi)">
          done at {cur.total}
        </text>
      </svg>
      <div className="grid grid-cols-2 gap-3">
        <Stat k="sync finishes at" v={sync.total} />
        <Stat k={`${mode} finishes at`} v={cur.total} tone={mode === "worker" && cur.total < sync.total ? "live" : undefined} />
      </div>
      <Legend
        items={[
          ["hot", "a read in flight"],
          ["ink", "the backend working on a page"],
          ["mute", "the backend waiting", "dashed"],
        ]}
      />
      <Provenance drawn="a toy schedule with made-up units: 8 pages, 4 reads ahead, 3 io workers" />
    </div>
  );
}
