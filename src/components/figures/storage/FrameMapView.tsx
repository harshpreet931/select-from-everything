"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, Row, Words, fmt, ring } from "@/components/figures/kit";
import { StepSql } from "@/components/db/StepSql";

// every frame of a small buffer pool as one square, at a few moments of a capture. a frame is
// filled with the table whose page it holds (pg_buffercache, by bufferid). frames holding
// something else (the catalog, indexes) are counted, not placed.

export type FrameMoment = { label: string; sql: string; note?: string; rels: Record<string, number[]>; other: number };

const FILL = ["var(--hi)", "color-mix(in srgb, var(--ink) 38%, transparent)"];

export function FrameMapView({ moments, size, rels, source }: { moments: FrameMoment[]; size: number; rels: string[]; source: { engine: { version: string; build?: string }; scenario: string } }) {
  const [k, setK] = useState(moments.length > 1 ? 1 : 0);
  const m = moments[k];
  const owner = new Map<number, number>();
  rels.forEach((r, ri) => (m.rels[r] ?? []).forEach((id) => owner.set(id, ri)));
  const cols = 16;
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="after =" w="8ch" last>
        <Words label="which moment" options={moments.map((x, i) => ({ v: i, label: x.label }))} value={k} onChange={setK} />
      </Row>
      <StepSql label={`T1: ${m.sql}`} />
      <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[640px]:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="img" aria-label={`${size} frames: ${rels.map((r) => `${(m.rels[r] ?? []).length} hold ${r}`).join(", ")}`}>
          {Array.from({ length: size }, (_, i) => {
            const id = i + 1;
            const o = owner.get(id);
            return <span key={id} className="aspect-square rounded-[2px]" title={`frame ${id}${o != null ? `: ${rels[o]}` : ""}`} style={{ background: o != null ? FILL[o] : undefined, boxShadow: o != null ? undefined : ring("line-2") }} />;
          })}
        </div>
        <div className="grid content-start gap-2">
          {rels.map((r, ri) => (
            <div key={r} className="flex items-baseline justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block size-3 rounded-[2px]" style={{ background: FILL[ri] }} />
                <span className="text-ink">{r}</span>
              </span>
              <span className="text-hi tabular">{fmt((m.rels[r] ?? []).length)} frames</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 text-faint">
            <span>anything else (catalog, indexes)</span>
            <span className="tabular">{fmt(m.other)}</span>
          </div>
          <Narration minLines={3}>{m.note}</Narration>
        </div>
      </div>
      <Legend items={[["mute", "a frame holding something else, or nothing", "dashed"]]} />
      <Provenance trace={source} />
    </div>
  );
}
