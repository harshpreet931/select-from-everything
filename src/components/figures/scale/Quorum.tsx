"use client";

import { useState } from "react";
import { Chip, NARR, Provenance, Row, Slider, ring, tint } from "@/components/figures/kit";

// quorum arithmetic, drawn by hand: n replicas, a write waits for w of them, a read asks r of
// them. the figure puts the write on the first w replicas and the read on the last r, the
// worst case for overlap. if w + r > n, they must share at least w + r - n replicas.

export function Quorum() {
  const [n, setN] = useState(5);
  const [w, setW] = useState(3);
  const [r, setR] = useState(3);
  const W = Math.min(w, n);
  const R = Math.min(r, n);
  const overlap = Math.max(0, W + R - n);
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="n =" w="5ch"><Slider k="replicas" min={1} max={9} value={n} onChange={(v) => { setN(v); setW(Math.min(w, v)); setR(Math.min(r, v)); }} /></Row>
        <Row k="w =" w="5ch"><Slider k="write quorum" min={1} max={n} value={W} onChange={setW} /></Row>
        <Row k="r =" w="5ch" last><Slider k="read quorum" min={1} max={n} value={R} onChange={setR} /></Row>
      </div>
      <div className="flex flex-wrap justify-center gap-2" role="img" aria-label={`${n} replicas; the write reaches ${W}, the read asks ${R}; they share ${overlap}`}>
        {Array.from({ length: n }, (_, i) => {
          const inW = i < W;
          const inR = i >= n - R;
          const both = inW && inR;
          return (
            <div key={i} className="grid w-[64px] gap-0.5 rounded-md px-1.5 py-2 text-center" style={{ boxShadow: ring(both ? "live" : "line-2", both ? 60 : undefined, both ? 1.5 : 1), background: both ? tint("live", 10) : "var(--well)" }}>
              <span className="text-11 text-faint">replica {i + 1}</span>
              <span className="text-12" style={{ color: inW ? "var(--hi)" : "var(--faint)" }}>{inW ? "x = 2" : "x = 1"}</span>
              <span className="text-[10px]" style={{ color: inR ? "var(--hot)" : "transparent" }}>read asks</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Chip tone={overlap ? "live" : "dead"}>w + r = {W + R} {W + R > n ? ">" : "≤"} n = {n}</Chip>
        <Chip tone={overlap ? "live" : "dead"}>{overlap ? `the read reaches ${overlap} replica${overlap > 1 ? "s" : ""} with x = 2` : "the read can miss the write entirely"}</Chip>
      </div>
      <p className={NARR} aria-live="polite">
        {overlap
          ? `any ${W} replicas and any ${R} replicas share at least ${overlap}, so the read always meets the latest write and can pick it by its version. a write survives ${n - W} slow or dead replicas, a read ${n - R}.`
          : `a write on ${W} and a read on ${R} out of ${n} can land on disjoint replicas: the read sees only x = 1. fast, and stale.`}
      </p>
      <Provenance drawn="quorum arithmetic: the write on the first w replicas, the read on the last r, the worst case" />
    </div>
  );
}
