"use client";

import { useState } from "react";
import { Chip, Legend, Narration, Provenance, Row, Words, fmt, useWidth } from "@/components/figures/kit";

// what the planner knows about events.user_id, drawn: the most common values as spikes, the
// histogram of everything else as equal-area buckets (narrow bucket = dense values). pick a
// predicate and a value; the part of the statistics the estimate reads goes hot, the arithmetic
// is printed under it, and the real count sits next to the estimate. the y axis is a square
// root scale, so the 4.5% spike and a 0.1% bucket both fit.

export type SelStats = {
  mcv: number[];
  freq: number[];
  hist: number[];
  rows: number;
  sumMcv: number;
  rest: number;
  nullFrac: number;
  nDistinct: number;
  others: number;
  eqSel: number;
};

export type SelPoint = {
  op: string;
  v: number;
  est: number;
  actual: number;
  kind: "mcv" | "rest" | "hist" | "default-eq" | "default-ineq";
  sel: number;
  freq?: number;
  rank?: number;
  mcvSel?: number;
  nBelow?: number;
  frac?: number;
  clamped?: boolean;
  bucket?: { i: number; a: number; b: number; bf: number };
};

const OPS = ["user_id =", "user_id <", "user_id + 0 =", "user_id + 0 <"];
const PAD = { l: 22, r: 10, t: 12, b: 26 };
const X1 = 520;

const f4 = (x: number) => fmt(x, x < 0.001 ? 6 : x < 0.1 ? 5 : 4);

export function SelectivityView({ stats, points, source }: { stats: SelStats; points: SelPoint[]; source: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const [op, setOp] = useState(OPS[0]);
  // the svg is drawn at its real width, so its labels stay readable on a phone
  const [box, boxW] = useWidth<HTMLDivElement>(640);
  const W = Math.max(300, Math.round(boxW));
  const H = W < 480 ? 190 : 210;
  const vals = [...new Set(points.map((p) => p.v))].sort((a, b) => a - b);
  const [vi, setVi] = useState(vals.indexOf(42));
  const v = vals[vi];
  const p = points.find((q) => q.op === op && q.v === v)!;
  const blind = p.kind === "default-eq" || p.kind === "default-ineq";
  const lt = op.endsWith("<");

  // geometry
  const x = (val: number) => PAD.l + (val / X1) * (W - PAD.l - PAD.r);
  const per = stats.rest / (stats.hist.length - 1); // each histogram bucket holds this share
  const dens = stats.hist.slice(1).map((b, i) => per / Math.max(1, b - stats.hist[i]));
  const top = Math.sqrt(Math.max(...stats.freq, ...dens));
  const y = (share: number) => H - PAD.b - (Math.sqrt(share) / top) * (H - PAD.t - PAD.b);
  const base = H - PAD.b;

  const ratio = p.actual === 0 ? Infinity : p.est >= p.actual ? p.est / p.actual : p.actual / p.est;
  const off = ratio >= 10;
  const close = ratio < 1.25;
  const pct = (s: number) => `${fmt(s * 100, s < 0.01 ? 3 : 2)}%`;

  let working: string[];
  if (p.kind === "mcv")
    working = [`${v} is most common value #${p.rank}, with frequency ${f4(p.freq!)}`, `${f4(p.freq!)} × ${fmt(stats.rows)} rows = ${fmt(p.sel * stats.rows, 1)} → ${fmt(p.est)}`];
  else if (p.kind === "rest")
    working = [
      `${v} isn't in the MCV list, so it gets an even share of what the MCVs leave over`,
      `(1 − ${f4(stats.sumMcv)} − ${stats.nullFrac}) / (${stats.nDistinct} − ${stats.mcv.length}) = ${f4(p.sel)}`,
      `${f4(p.sel)} × ${fmt(stats.rows)} = ${fmt(p.sel * stats.rows, 1)} → ${fmt(p.est)}`,
    ];
  else if (p.kind === "hist") {
    const b = p.bucket;
    working = [
      `MCVs below ${v}: ${p.nBelow} of ${stats.mcv.length}, frequencies adding up to ${f4(p.mcvSel!)}`,
      b
        ? `histogram: ${v} lands in bucket ${b.i} of ${stats.hist.length - 1}, [${b.a}, ${b.b}), ${fmt(b.bf * 100, 0)}% of the way in → (${b.i - 1} + ${fmt(b.bf, 2)}) / ${stats.hist.length - 1}${b.i === 1 ? " (+ the first bucket's adjustment)" : ""} − 1/${stats.others} for < = ${f4(p.frac!)} of the rest${p.clamped ? " (clamped)" : ""}`
        : `histogram: ${v} is ${p.frac! < 0.5 ? "below the first bound" : "past the last bound"} → ${f4(p.frac!)} of the rest${p.clamped ? " (clamped: never 0 or 1)" : ""}`,
      `${f4(p.mcvSel!)} + ${f4(p.frac!)} × ${f4(stats.rest)} = ${f4(p.sel)};  × ${fmt(stats.rows)} → ${fmt(p.est)}`,
    ];
  } else if (p.kind === "default-eq")
    working = ["no statistics exist for the expression user_id + 0", `a default guess for =: 0.005 × ${fmt(stats.rows)} = ${fmt(p.est)}, whatever the value`];
  else working = ["no statistics exist for the expression user_id + 0", `a default guess for < : 1/3 × ${fmt(stats.rows)} = ${fmt(p.est)}, whatever the value`];

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12" aria-label="the statistics for events.user_id, and how a predicate turns them into a row estimate">
      <div>
        <Row k="WHERE" w="8ch">
          <Words label="predicate" options={OPS.map((o) => ({ v: o, label: `${o} ${v}` }))} value={op} onChange={setOp} />
        </Row>
        <Row k="value =" w="8ch" last>
          <div className="flex w-full min-w-0 items-center gap-3">
            <input type="range" className="slider min-w-0 flex-1" min={0} max={vals.length - 1} step={1} value={vi} onChange={(e) => setVi(Number(e.target.value))} aria-label="value" />
            <span className="min-w-[4ch] text-right text-12 text-hi tabular">{v}</span>
          </div>
        </Row>
      </div>

      <div ref={box} className="min-w-0 overflow-hidden rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`most common values as spikes, the histogram as buckets; the predicate ${op} ${v} reads ${p.kind === "mcv" ? "one spike" : p.kind === "hist" ? "the spikes and buckets below it" : p.kind === "rest" ? "neither, only the distinct count" : "nothing, it can't see the column"}`}>
          <g style={{ opacity: blind ? 0.3 : 1, transition: "opacity 200ms" }}>
            {/* histogram buckets */}
            {stats.hist.slice(1).map((b, i) => {
              const a = stats.hist[i];
              const left = x(a);
              const right = x(b);
              const yy = y(dens[i]);
              const full = lt && !blind && b <= v;
              const part = lt && !blind && p.bucket && p.bucket.i === i + 1;
              return (
                <g key={`h${i}`}>
                  <rect x={left} y={yy} width={Math.max(0.5, right - left)} height={base - yy} fill="var(--meta)" opacity={0.16} />
                  {full && <rect x={left} y={yy} width={Math.max(0.5, right - left)} height={base - yy} fill="var(--hot)" opacity={0.45} />}
                  {part && <rect x={left} y={yy} width={Math.max(0.5, (right - left) * p.bucket!.bf)} height={base - yy} fill="var(--hot)" opacity={0.7} />}
                  <line x1={left} x2={left} y1={yy} y2={base} stroke="var(--meta)" strokeOpacity={0.35} strokeWidth={0.6} />
                </g>
              );
            })}
            {/* most common values */}
            {stats.mcv.map((m, i) => {
              const on = !blind && ((p.kind === "mcv" && m === v) || (p.kind === "hist" && m < v));
              return <line key={`m${i}`} x1={x(m)} x2={x(m)} y1={base} y2={y(stats.freq[i])} stroke={on ? "var(--hot)" : "var(--meta)"} strokeWidth={on ? 2.2 : 1.4} strokeOpacity={on ? 1 : 0.7} />;
            })}
            {/* a non-MCV value's even share */}
            {p.kind === "rest" && <line x1={x(stats.hist[0])} x2={x(stats.hist[stats.hist.length - 1])} y1={y(p.sel)} y2={y(p.sel)} stroke="var(--hot)" strokeDasharray="4 3" strokeWidth={1.2} />}
          </g>
          {/* the predicate */}
          <line x1={x(Math.min(v, X1))} x2={x(Math.min(v, X1))} y1={PAD.t - 4} y2={base} stroke="var(--hot)" strokeDasharray="3 3" strokeWidth={1} />
          <text x={x(Math.min(v, X1)) + (v > 260 ? -4 : 4)} y={PAD.t + 6} textAnchor={v > 260 ? "end" : "start"} fontSize={11} fill="var(--hot)" className="font-mono">
            {op} {v}
          </text>
          {/* axes */}
          <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} stroke="var(--line-2)" />
          {(W < 480 ? [0, 250, 500] : [0, 100, 200, 300, 400, 500]).map((t) => (
            <text key={t} x={x(t)} y={H - 8} fontSize={10} textAnchor="middle" fill="var(--faint)" className="font-mono">
              {t}
            </text>
          ))}
          <text x={4} y={PAD.t + 4} fontSize={9.5} fill="var(--faint)" className="font-mono">
            √
          </text>
        </svg>
      </div>
      <Legend
        items={[
          ["meta", "most common values (spikes) and histogram buckets: what ANALYZE wrote down"],
          ["hot", "the part this estimate reads"],
        ]}
      />

      <div className="grid gap-1 rounded-md bg-well px-3 py-2.5 text-11 leading-5 shadow-[inset_0_0_0_1px_var(--line)]">
        {working.map((w, i) => (
          <div key={i} className="min-w-0 break-words text-ink">
            {w}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-12 tabular">
        <span className="text-mute" style={{ textDecorationLine: "underline", textDecorationStyle: "dashed", textDecorationColor: "var(--line-2)", textUnderlineOffset: 3 }}>
          estimate {fmt(p.est)}
        </span>
        <span className="text-hi">actual {fmt(p.actual)}</span>
        {off ? (
          <Chip tone="dead">{Number.isFinite(ratio) ? `${fmt(ratio, 0)}× off` : "nothing there"}</Chip>
        ) : close ? (
          <Chip tone="live">close</Chip>
        ) : (
          <Chip tone="faint">{fmt(ratio, 1)}× off</Chip>
        )}
        <span className="text-faint">selectivity {pct(p.sel)}</span>
      </div>

      <Narration minLines={2}>
        {p.kind === "mcv" && "a most common value: the planner knows its exact share. on a table ANALYZE read in full, this is exact."}
        {p.kind === "rest" && (v > stats.hist[stats.hist.length - 1] ? "past the largest value ever seen, and still the even share: equality doesn't look at the histogram at all." : "every value outside the MCV list gets the same estimate, whether it has 19 rows or 53.")}
        {p.kind === "hist" && (p.bucket ? "the MCVs below the value count exactly. inside a bucket, the planner assumes values are spread evenly and interpolates." : "outside the histogram, the planner still won't say none or all: it clamps to a sliver.")}
        {blind && "wrap the column in anything the statistics don't cover and the planner is guessing. the guess never moves, whatever the value."}
      </Narration>
      <Provenance trace={source} />
    </div>
  );
}
