"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, Slider, fmt } from "@/components/figures/kit";

// percentile_cont against percentile_disc on a number line. the values, and both functions'
// answers at every fraction offered, are captured (one call each, with an array of fractions).
// the slider only picks which captured answer to show. the narration spells out the arithmetic
// the two functions are defined by, on those captured values.

const parseNums = (v: string | null) => (v ? v.replace(/[{}]/g, "").split(",").map(Number) : []);

export function PercentileLine({
  values,
  fractions,
  cont,
  disc,
  start = 6,
  trace,
}: {
  /** label, value: sorted ascending */
  values: (string | null)[][];
  fractions: number[];
  /** the captured arrays, as postgres printed them */
  cont: string;
  disc: string;
  start?: number;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [k, setK] = useState(start);
  const vs = values.map((r) => Number(r[1]));
  const cs = parseNums(cont);
  const ds = parseNums(disc);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const W = 640;
  const PAD = 28;
  const x = (v: number) => PAD + ((v - lo) / (hi - lo || 1)) * (W - 2 * PAD);
  const p = fractions[k];
  const c = cs[k];
  const d = ds[k];
  const n = vs.length;
  const pos = p * (n - 1);
  const a = Math.floor(pos);
  const b = Math.ceil(pos);
  const name = (i: number) => values[i]?.[0] ?? "";
  const di = vs.findIndex((v) => v === d);

  const contText =
    a === b
      ? `cont: position ${fmt(pos, 2)} in 0 to ${n - 1} lands exactly on ${name(a)}, ${fmt(vs[a])}.`
      : `cont: position ${fmt(pos, 2)} in 0 to ${n - 1} falls between ${name(a)} (${fmt(vs[a])}) and ${name(b)} (${fmt(vs[b])}), so it interpolates: ${fmt(c)}.`;
  const discText = `disc: the first value with at least ${fmt(p * 100, 0)}% of the rows at or below it: ${name(di)}, ${fmt(d)}${di >= 0 ? ` (${di + 1} of ${n})` : ""}.`;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="percentile_cont and percentile_disc on a number line">
      <div className="grid grid-cols-[11ch_minmax(0,1fr)] items-center gap-x-3 text-12">
        <span className="text-faint">fraction =</span>
        <Slider k="fraction" min={0} max={fractions.length - 1} value={k} onChange={setK} format={(i) => fractions[i].toFixed(2)} />
      </div>
      <svg viewBox={`0 0 ${W} 132`} className="w-full" role="img" aria-label={`at ${p}, percentile_cont is ${c} and percentile_disc is ${d}`}>
        <line x1={PAD} x2={W - PAD} y1={70} y2={70} stroke="var(--line-2)" strokeWidth={1} />
        {vs.map((v, i) => (
          <g key={i}>
            <circle cx={x(v)} cy={70} r={i === di ? 6 : 4} fill={i === di ? "var(--ref)" : "var(--well)"} stroke={i === di ? "var(--ref)" : "var(--mute)"} strokeWidth={1.2} style={{ transition: "r 200ms var(--ease)" }} />
            <text x={x(v)} y={i % 2 ? 100 : 114} textAnchor="middle" fontSize={11} fill="var(--faint)" className="tabular">
              {fmt(v / 1000)}k
            </text>
          </g>
        ))}
        <g style={{ transform: `translateX(${x(c)}px)`, transition: "transform 220ms var(--ease)" }}>
          <line x1={0} x2={0} y1={34} y2={64} stroke="var(--hot)" strokeWidth={1.5} />
          <path d="M-5 60 L0 66 L5 60 z" fill="var(--hot)" />
          <text x={0} y={26} textAnchor="middle" fontSize={12} fill="var(--hot)" className="tabular">
            cont {fmt(c)}
          </text>
        </g>
      </svg>
      <Legend items={[["hot", "percentile_cont", "line"], ["ref", "percentile_disc (a real row)"]]} />
      <Narration minLines={3}>
        <span className="block font-mono text-11 text-hot not-italic">{contText}</span>
        <span className="block font-mono text-11 text-ref not-italic">{discText}</span>
      </Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
