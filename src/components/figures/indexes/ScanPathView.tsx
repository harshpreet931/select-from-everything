"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, Row, Words, fmt, useWidth } from "@/components/figures/kit";

// the same 30 rows, fetched two ways. an index scan visits them in key order: page 545, then
// 139, then 279, back and forth across the file. a bitmap scan first collects every address,
// sorts them by page, and then sweeps the file once, front to back. the strip is the table
// (one mark per 8 KB page); the arcs are the jumps between consecutive page visits.

type Order = "index" | "bitmap";

export function ScanPathView({ pages, total, source }: { pages: number[]; total: number; source: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const [order, setOrder] = useState<Order>("index");
  const [wrap, w] = useWidth<HTMLDivElement>(700);
  const seq = order === "index" ? pages : [...new Set(pages)].sort((a, b) => a - b);
  const W = Math.max(300, w);
  const pad = 14;
  const x = (p: number) => pad + (p / Math.max(1, total - 1)) * (W - pad * 2);
  const H = 150;
  const base = 112;
  const travel = seq.reduce((a, p, i) => (i ? a + Math.abs(p - seq[i - 1]) : a), 0);
  const back = seq.reduce((a, p, i) => (i && p < seq[i - 1] ? a + 1 : a), 0);
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12" aria-label="the order a scan visits heap pages">
      <Row k="visit in =" w="11ch" last>
        <Words
          label="visit order"
          options={[
            { v: "index", label: "index order (Index Scan)" },
            { v: "bitmap", label: "page order (Bitmap Heap Scan)" },
          ]}
          value={order}
          onChange={setOrder}
        />
      </Row>
      <div ref={wrap} className="min-w-0">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={`${seq.length} page visits across a ${total}-page table, ${order === "index" ? "in index order" : "in page order"}`} style={{ fontFamily: "var(--font-code)" }}>
          {/* the table: one 8 KB page per tick */}
          <rect x={pad} y={base} width={W - pad * 2} height={12} rx={2} fill="var(--well-2)" stroke="var(--line-2)" />
          {seq.map((p, i) => {
            if (!i) return null;
            const a = x(seq[i - 1]);
            const b = x(p);
            const h = Math.min(base - 12, 14 + Math.abs(b - a) * 0.32);
            return <path key={`${order}-${i}`} d={`M${a} ${base} C${a} ${base - h}, ${b} ${base - h}, ${b} ${base}`} fill="none" stroke="var(--ref)" strokeWidth={1} opacity={0.55} />;
          })}
          {seq.map((p, i) => (
            <circle key={`${order}-d-${i}`} cx={x(p)} cy={base + 6} r={2.6} fill={i === 0 ? "var(--hot)" : "var(--ref)"} />
          ))}
          <text x={pad} y={H - 4} fontSize={10} fill="var(--faint)">
            page 0
          </text>
          <text x={W - pad} y={H - 4} fontSize={10} fill="var(--faint)" textAnchor="end">
            page {fmt(total - 1)}
          </text>
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-11 text-mute tabular">
        <span>
          page visits <span className="text-hi">{fmt(seq.length)}</span>
        </span>
        <span>
          backward jumps <span className="text-hi">{fmt(back)}</span>
        </span>
        <span>
          distance travelled <span className="text-hi">{fmt(travel)} pages</span>
        </span>
      </div>
      <Narration minLines={2}>
        {order === "index"
          ? `the index hands out addresses in key order, and key order has nothing to do with where the rows live. on a disk, each of these jumps is a seek.`
          : `same ${fmt(seq.length)} pages, sorted by page number first: one pass from the front of the file to the back, no page visited twice.`}
      </Narration>
      <Legend
        items={[
          ["ref", "a jump to the next page"],
          ["hot", "the first page visited"],
        ]}
      />
      <Provenance trace={source} />
    </div>
  );
}
