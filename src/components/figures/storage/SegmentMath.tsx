"use client";

import { useState } from "react";
import { Narration, Row, Words, fmt, ring, tint } from "@/components/figures/kit";

// block number → file and offset. a table is one file per 1 GB segment: block b lives in
// segment b / blocks-per-segment, at byte (b mod blocks-per-segment) * block size of that
// file. the sizes come from SHOW block_size and SHOW segment_size; the arithmetic is md.c's.

export function SegmentMath({ relfilenode, blockSize, segmentBytes, blocks }: { relfilenode: string; blockSize: number; segmentBytes: number; blocks: number[] }) {
  const per = segmentBytes / blockSize;
  const [b, setB] = useState(blocks[1] ?? blocks[0]);
  const seg = Math.floor(b / per);
  const off = (b % per) * blockSize;
  const file = seg ? `${relfilenode}.${seg}` : relfilenode;
  const shownSegs = Math.max(3, seg + 1);
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="block =" w="8ch" last>
        <Words label="block number" options={blocks.map((x) => ({ v: x, label: fmt(x) }))} value={b} onChange={setB} />
      </Row>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${shownSegs}, minmax(0, 1fr))` }} role="img" aria-label={`block ${b} is in file ${file} at byte ${off}`}>
        {Array.from({ length: shownSegs }, (_, s) => {
          const on = s === seg;
          return (
            <div key={s} className="min-w-0">
              <div className="relative h-9 rounded-[4px]" style={{ boxShadow: on ? ring("ref", undefined, 1.5) : ring("line-2"), background: on ? tint("ref", 6) : undefined }}>
                {on && <span className="absolute inset-y-1 w-[3px] rounded-full" style={{ left: `calc(${(off / segmentBytes) * 100}% - 1px)`, background: "var(--hot)" }} />}
              </div>
              <div className={`mt-1 truncate text-11 tabular ${on ? "text-ref" : "text-faint"}`}>{s ? `${relfilenode}.${s}` : relfilenode}</div>
              <div className="text-[10px] text-faint tabular">
                blocks {fmt(s * per)}–{fmt((s + 1) * per - 1)}
              </div>
            </div>
          );
        })}
      </div>
      <Narration minLines={2}>
        block {fmt(b)} ÷ {fmt(per)} blocks per segment = segment {seg}, so it's in the file <code>{file}</code>, {fmt(off)} bytes in ({fmt(b % per)} × {fmt(blockSize)}).
      </Narration>
    </div>
  );
}
