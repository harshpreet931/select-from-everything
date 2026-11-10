"use client";

import { useMemo, useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, Row, Stat, Words, fmt, useReducedMotion, useWidth } from "@/components/figures/kit";

// the order three scans visit heap pages in, for the same matching rows. x is the page number,
// y is time (one step down per page visit). an index scan follows the index, so it sweeps the
// table once per key and comes back to pages it has already read; a bitmap scan sorts the
// addresses first and sweeps once; a seq scan sweeps every page. play it to watch the sweeps.

type Scan = "index scan" | "bitmap heap scan" | "seq scan";
const FRAMES = 48;

export function ReadOrderView({
  order,
  pages,
  buffers,
  source,
}: {
  order: number[];
  pages: number;
  buffers: { index: number; bitmap: number; seq: number };
  source: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [scan, setScan] = useState<Scan>("index scan");
  const reduce = useReducedMotion();
  const s = useStepper(FRAMES + 1, { interval: 90, start: FRAMES });
  const [wrap, w] = useWidth<HTMLDivElement>(760);
  const matched = useMemo(() => new Set(order), [order]);
  const visits = useMemo(() => {
    const idx: number[] = order.filter((p, i) => i === 0 || p !== order[i - 1]);
    const bmp = [...matched].sort((a, b) => a - b);
    const seq = Array.from({ length: pages }, (_, i) => i);
    return { "index scan": idx, "bitmap heap scan": bmp, "seq scan": seq } as Record<Scan, number[]>;
  }, [order, matched, pages]);
  const v = visits[scan];
  const maxV = Math.max(...Object.values(visits).map((x) => x.length));
  const shown = reduce ? v.length : Math.round((s.i / FRAMES) * v.length);
  const W = Math.max(300, w);
  const H = w < 520 ? 170 : 220;
  const padL = 4;
  const x = (p: number) => padL + (p / Math.max(1, pages - 1)) * (W - padL * 2);
  const y = (k: number) => 6 + (k / Math.max(1, maxV - 1)) * (H - 12);
  const path = v
    .slice(0, shown)
    .map((p, k) => `${k ? "L" : "M"}${x(p).toFixed(1)} ${y(k).toFixed(1)}`)
    .join(" ");
  const buf = scan === "index scan" ? buffers.index : scan === "bitmap heap scan" ? buffers.bitmap : buffers.seq;
  const note =
    scan === "index scan"
      ? `the index hands over rows by user_id, then by address. so the scan sweeps the table once for user 7, again for 8, again for 9: ${fmt(v.length)} page visits for ${fmt(matched.size)} different pages, and every one of them is a jump to wherever the next row lives.`
      : scan === "bitmap heap scan"
        ? `the bitmap index scan collects all ${fmt(order.length)} addresses first and sorts them by page. then the heap is read in one forward sweep, each page once: ${fmt(v.length)} visits, skipping the ${fmt(pages - matched.size)} pages with no match.`
        : `no index: read all ${fmt(pages)} pages, front to back, and test every row on them. pages with a match are the dark dots. strictly in order, which is what disks and read-ahead like best.`;
  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12 outline-none">
      <Row k="scan =" w="7ch" last>
        <Words label="which scan" options={["index scan", "bitmap heap scan", "seq scan"] as Scan[]} value={scan} onChange={(x) => (setScan(x), s.go(FRAMES))} />
      </Row>
      <div className="grid grid-cols-3 gap-3">
        <Stat k="heap page visits" v={fmt(v.length)} tone="hot" />
        <Stat k="different pages" v={fmt(new Set(v).size)} />
        <Stat k="EXPLAIN's Buffers" v={fmt(buf)} />
      </div>
      <div ref={wrap} className="min-w-0">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={`${scan}: ${v.length} visits to heap pages, plotted as page number against time`}>
          <rect x={0} y={0} width={W} height={H} rx={4} fill="var(--well)" />
          {scan === "seq scan" &&
            v.slice(0, shown).map((p, k) =>
              matched.has(p) ? null : <circle key={k} cx={x(p)} cy={y(k)} r={1.3} fill="var(--faint)" opacity={0.6} />,
            )}
          <path d={path} fill="none" stroke="var(--ref)" strokeWidth={0.9} opacity={scan === "seq scan" ? 0.25 : 0.45} />
          {v.slice(0, shown).map((p, k) => (matched.has(p) ? <circle key={`m${k}`} cx={x(p)} cy={y(k)} r={1.7} fill="var(--ref)" /> : null))}
          {shown > 0 && shown < v.length && <circle cx={x(v[shown - 1])} cy={y(shown - 1)} r={4} fill="none" stroke="var(--hot)" strokeWidth={1.5} />}
        </svg>
        <div className="mt-1 flex justify-between text-[10.5px] text-faint">
          <span>page 0</span>
          <span>heap page →, time ↓</span>
          <span>page {fmt(pages - 1)}</span>
        </div>
      </div>
      <Narration minLines={3}>{note}</Narration>
      {!reduce && <StepControls s={s} label="frame" />}
      <Provenance trace={source} />
    </div>
  );
}
