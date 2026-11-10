"use client";

import { useState } from "react";
import { Legend, Provenance, Row, Words, NARR } from "@/components/figures/kit";

// the textbook picture of two-phase locking, drawn by hand: how many locks one transaction holds
// over time. a growing phase (only acquire), the lock point (the peak), a shrinking phase (only
// release). strict 2PL holds the write locks to the end and drops them at commit. the third
// shape releases and then acquires again: not two-phase.

type Ev = { at: number; d: 1 | -1; what: string };
const RUNS: Record<string, { evs: Ev[]; end: number; note: string; ok: boolean }> = {
  "basic 2PL": {
    evs: [
      { at: 1, d: 1, what: "lock A" },
      { at: 2, d: 1, what: "lock B" },
      { at: 3, d: 1, what: "lock C" },
      { at: 5, d: -1, what: "unlock A" },
      { at: 6, d: -1, what: "unlock B" },
      { at: 7, d: -1, what: "unlock C" },
    ],
    end: 9,
    ok: true,
    note: "all acquires before any release. the peak is the lock point: order the transactions by their lock points and you have the equivalent serial order. but A is released at 5 and the commit is at 9: anyone who reads A in between reads uncommitted data.",
  },
  "strict 2PL": {
    evs: [
      { at: 1, d: 1, what: "lock A" },
      { at: 2, d: 1, what: "lock B" },
      { at: 3, d: 1, what: "lock C" },
      { at: 9, d: -1, what: "commit, unlock all" },
    ],
    end: 9,
    ok: true,
    note: "still two-phase, but the shrinking phase is a single instant: COMMIT. nobody can see what T1 wrote until it's committed, so an abort never drags anyone else down with it. this is what postgres does with its write locks.",
  },
  "not two-phase": {
    evs: [
      { at: 1, d: 1, what: "lock A" },
      { at: 3, d: -1, what: "unlock A" },
      { at: 5, d: 1, what: "lock B" },
      { at: 7, d: -1, what: "unlock B" },
    ],
    end: 9,
    ok: false,
    note: "releases A, then acquires B. between 3 and 5 another transaction can change A and B, so T1 can see the old A and the new B: a state no serial order produces. no single lock point, no guarantee.",
  },
};

export function TwoPhaseChart() {
  const [k, setK] = useState("basic 2PL");
  const r = RUNS[k];
  const W = 520;
  const H = 205;
  const x0 = 40;
  const sx = (W - x0 - 20) / r.end;
  const y0 = 150;
  const sy = 32;
  let n = 0;
  const pts: [number, number][] = [[x0, y0]];
  for (const e of r.evs) {
    pts.push([x0 + e.at * sx, y0 - n * sy]);
    n += e.d === 1 ? 1 : k === "strict 2PL" && e.what.startsWith("commit") ? -n : -1;
    pts.push([x0 + e.at * sx, y0 - n * sy]);
  }
  pts.push([x0 + r.end * sx, y0 - n * sy]);
  let peak = 0;
  let cur = 0;
  let peakAt = 0;
  for (const e of r.evs) {
    cur += e.d;
    if (e.d === 1 && cur >= peak) {
      peak = cur;
      peakAt = e.at;
    }
  }
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="protocol =" w="11ch" last>
        <Words label="protocol" options={Object.keys(RUNS)} value={k} onChange={setK} />
      </Row>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[560px]" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={`locks held by T1 over time, ${k}: ${r.evs.map((e) => `${e.what} at ${e.at}`).join(", ")}`}>
        <line x1={x0} y1={y0} x2={W - 16} y2={y0} stroke="var(--line-2)" />
        <line x1={x0} y1={y0} x2={x0} y2={20} stroke="var(--line-2)" />
        <text x={x0 - 8} y={26} textAnchor="end" fontSize={9.5} fill="var(--faint)">
          locks
        </text>
        <text x={W - 16} y={y0 + 46} textAnchor="end" fontSize={9.5} fill="var(--faint)">
          time →
        </text>
        {[1, 2, 3].map((v) => (
          <text key={v} x={x0 - 8} y={y0 - v * sy + 3} textAnchor="end" fontSize={9.5} fill="var(--faint)">
            {v}
          </text>
        ))}
        {r.ok && (
          <>
            <rect x={x0} y={18} width={peakAt * sx} height={y0 - 18} fill="var(--live)" opacity={0.06} />
            <text x={x0 + (peakAt * sx) / 2} y={30} textAnchor="middle" fontSize={10} fill="var(--live)">
              growing
            </text>
            <text x={x0 + peakAt * sx + ((r.end - peakAt) * sx) / 2} y={30} textAnchor="middle" fontSize={10} fill="var(--mute)">
              shrinking
            </text>
            <line x1={x0 + peakAt * sx} y1={y0 - peak * sy - 8} x2={x0 + peakAt * sx} y2={y0} stroke="var(--hot)" strokeDasharray="3 3" />
            <text x={x0 + peakAt * sx + 4} y={y0 - peak * sy - 12} fontSize={10} fill="var(--hot)">
              lock point
            </text>
          </>
        )}
        <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={r.ok ? "var(--meta)" : "var(--dead)"} strokeWidth={2} />
        {r.evs.map((e, i) => (
          <text key={i} x={x0 + e.at * sx} y={y0 + 14 + (i % 2) * 11} textAnchor={e.at >= r.end ? "end" : "middle"} fontSize={9} fill="var(--mute)">
            {e.what}
          </text>
        ))}
        <line x1={x0 + r.end * sx} y1={y0 - 4} x2={x0 + r.end * sx} y2={y0 + 4} stroke="var(--live)" strokeWidth={2} />
        {!r.evs.some((e) => e.what.startsWith("commit")) && (
          <text x={x0 + r.end * sx} y={y0 - 8} textAnchor="middle" fontSize={9.5} fill="var(--live)">
            commit
          </text>
        )}
      </svg>
      <p className={NARR} aria-live="polite">
        <span style={{ color: r.ok ? "var(--live)" : "var(--dead)" }}>{r.ok ? "two-phase." : "not two-phase."}</span> {r.note}
      </p>
      <Legend items={[["meta", "locks held by T1", "line"], ["hot", "the lock point", "dashed"]]} />
      <Provenance drawn="the textbook model of two-phase locking" />
    </div>
  );
}
