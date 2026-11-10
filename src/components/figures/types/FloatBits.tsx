"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, Words, tint, type LegendItem } from "@/components/figures/kit";

// the 64 bits of a float8, as postgres sends them (float8send), split into sign, exponent and
// mantissa, and the exact decimal value those bits hold (computed by postgres in numeric from the
// same bits). everything comes from one captured query; the figure only lays it out. when a value
// has a `vs`, the bits that differ from that value's are marked.

export type FloatRow = { label: string; shown: string; hex: string; bits: string; exponent: string; exactly: string };

function common(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export function FloatBits({
  rows,
  vs = {},
  notes,
  trace,
}: {
  /** captured: label, shown, hex, bits (64 chars), exponent (unbiased), exactly */
  rows: FloatRow[];
  /** label → the label whose bits it should be compared with */
  vs?: Record<string, string>;
  /** label → one sentence */
  notes: Record<string, string>;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [pick, setPick] = useState(rows[0].label);
  const r = rows.find((x) => x.label === pick)!;
  const other = vs[pick] ? rows.find((x) => x.label === vs[pick]) : undefined;
  const diff = new Set<number>();
  if (other) for (let i = 0; i < 64; i++) if (other.bits[i] !== r.bits[i]) diff.add(i);
  // the decimal the label promises, padded to the exact value's length: where they part ways
  const want = pick.includes("+") ? (other?.label ?? pick) : pick;
  const same = common(r.exactly, want.padEnd(r.exactly.length, "0"));

  const legend: LegendItem[] = [["meta", "exponent bits"], ["hot", "where the stored value stops matching"]];
  if (other) legend.push(["dead", `differs from ${other.label}`]);

  const group = (from: number, to: number, label: string, color: string) => (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap gap-x-[5px] gap-y-1">
        {Array.from({ length: Math.ceil((to - from) / 4) }, (_, k) => {
          const a = from + k * 4;
          const b = Math.min(to, a + 4);
          return (
            <span key={a} className="inline-flex">
              {Array.from({ length: b - a }, (_, j) => {
                const i = a + j;
                const d = diff.has(i);
                return (
                  <span
                    key={i}
                    className="inline-block w-[1.05ch] text-center text-12 leading-5 tabular transition-colors duration-200 ease-sfe"
                    style={{ color: d ? "var(--dead)" : r.bits[i] === "1" ? color : "var(--faint)", background: d ? tint("dead", 14) : undefined }}
                    title={`bit ${63 - i}`}
                  >
                    {r.bits[i]}
                  </span>
                );
              })}
            </span>
          );
        })}
      </div>
      <span className="text-[10px] leading-3 text-faint">{label}</span>
    </div>
  );

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="the bits of a double precision number">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line pb-2 text-12 @min-[520px]:grid-cols-[8ch_minmax(0,1fr)]">
        <span className="pt-0.5 text-faint">float8 =</span>
        <Words options={rows.map((x) => x.label)} value={pick} onChange={setPick} label="value" />
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-md bg-well px-3 py-3 shadow-[inset_0_0_0_1px_var(--line)]" role="img" aria-label={`${pick} as 64 bits: ${r.hex}`}>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          {group(0, 1, "sign", "var(--hi)")}
          {group(1, 12, `exponent: 2^${r.exponent}`, "var(--meta)")}
          {group(12, 64, "mantissa: the 52 bits after the leading 1", "var(--hi)")}
        </div>
        {other && (
          <div className="text-11 text-faint">
            {other.label} is <span className="text-ink">{other.hex}</span>, this is <span className="text-ink">{r.hex}</span>: {diff.size} {diff.size === 1 ? "bit differs" : "bits differ"}.
          </div>
        )}
      </div>
      <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1 text-12 @min-[560px]:grid-cols-[16ch_minmax(0,1fr)]">
        <dt className="text-faint">postgres prints</dt>
        <dd className="m-0 text-hi tabular">{r.shown}</dd>
        <dt className="text-faint">the bits hold</dt>
        <dd className="m-0 min-w-0 tabular [overflow-wrap:anywhere]">
          <span className="text-ink">{r.exactly.slice(0, same)}</span>
          <span style={{ color: "var(--hot)" }}>{r.exactly.slice(same)}</span>
        </dd>
      </dl>
      <Narration minLines={3}>{notes[pick]}</Narration>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Legend items={legend} />
        {trace && <Provenance trace={trace} />}
      </div>
    </div>
  );
}
