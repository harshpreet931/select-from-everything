"use client";

import { useMemo, useState } from "react";
import { Provenance, Row, Slider, ring, tint } from "@/components/figures/kit";
import { hashUint32 } from "@/lib/db/sim/hash";

// a bloom filter you can poke: m bits, k hash functions (double hashing, Kirsch and
// Mitzenmacher: h1 + i·h2, both from the hashint4 port), a few keys added. ask for a key and
// see which bits it checks: any 0 means "definitely not", all 1s mean "maybe". under it, the
// false positive rate computed live from the formula (1 − e^(−k·n/m))^k, for the bits per key
// on the slider. nothing here is typed in: every number is computed.

const M = 48;
const ADDED = [42, 7, 1999, 314, 8086, 64];

const bitsOf = (key: number, k: number, m: number) => {
  const h1 = hashUint32(key);
  const h2 = hashUint32(key ^ 0x5bd1e995) | 1;
  return Array.from({ length: k }, (_, i) => (((h1 + i * h2) >>> 0) % m) >>> 0);
};

export const fpRate = (bitsPerKey: number, k: number) => Math.pow(1 - Math.exp(-k / bitsPerKey), k);

export function BloomFilter() {
  const [k, setK] = useState(3);
  const [probe, setProbe] = useState(55);
  const [bpk, setBpk] = useState(10);
  const set = useMemo(() => {
    const s = new Set<number>();
    for (const key of ADDED) for (const b of bitsOf(key, k, M)) s.add(b);
    return s;
  }, [k]);
  const checks = bitsOf(probe, k, M);
  const maybe = checks.every((b) => set.has(b));
  const really = ADDED.includes(probe);
  const kOpt = Math.max(1, Math.round(bpk * Math.LN2));
  const fp = fpRate(bpk, kOpt);
  const fill = set.size / M;
  return (
    <div className="grid min-w-0 gap-4 text-12">
      <div>
        <Row k="keys in =" w="11ch">
          <span className="text-hi tabular">{ADDED.join(", ")}</span>
        </Row>
        <Row k="hashes k =" w="11ch">
          {[1, 2, 3, 4, 6].map((x) => (
            <button key={x} type="button" className="word" aria-pressed={k === x} onClick={() => setK(x)}>
              {x}
            </button>
          ))}
        </Row>
        <Row k="look up =" w="11ch" last>
          {[42, 55, 314, 500, 170, 9000].map((x) => (
            <button key={x} type="button" className="word" aria-pressed={probe === x} onClick={() => setProbe(x)}>
              {x}
            </button>
          ))}
        </Row>
      </div>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap gap-[3px]" role="img" aria-label={`${M} bits, ${set.size} set. ${probe} checks bits ${checks.join(", ")}`}>
          {Array.from({ length: M }, (_, i) => {
            const on = set.has(i);
            const checked = checks.includes(i);
            return (
              <span
                key={i}
                className="inline-flex size-[18px] items-center justify-center rounded-[2px] text-[10px] tabular transition-[box-shadow,background-color] duration-200 ease-sfe"
                style={{
                  boxShadow: checked ? ring(on ? "hot" : "live", undefined, 1.5) : ring("line-2"),
                  background: on ? tint("ref", 30) : "var(--bg)",
                  color: on ? "var(--ref)" : "var(--faint)",
                }}
                title={`bit ${i}`}
              >
                {on ? 1 : 0}
              </span>
            );
          })}
        </div>
        <div className="text-11 text-mute tabular">
          {set.size} of {M} bits set ({Math.round(fill * 100)}%). {probe} checks bits {checks.join(", ")}:{" "}
          {maybe ? (
            <span className="text-hot">all set, so "maybe"{really ? ` (and it is in)` : `, a false positive: ${probe} was never added`}</span>
          ) : (
            <span className="text-live">a 0 among them, so "definitely not"</span>
          )}
        </div>
      </div>
      <div className="grid gap-2 rounded-md px-3 py-2.5" style={{ boxShadow: ring("line-2") }}>
        <Row k="bits/key =" w="11ch" last>
          <Slider k="bits per key" min={2} max={20} step={1} value={bpk} onChange={setBpk} />
        </Row>
        <div className="text-11 text-mute tabular">
          best k = round({bpk} × ln 2) = <span className="text-hi">{kOpt}</span>. false positives = (1 − e<sup>−{kOpt}/{bpk}</sup>)<sup>{kOpt}</sup> ={" "}
          <span className="text-hot">{fp < 0.001 ? (fp * 100).toFixed(4) : (fp * 100).toFixed(2)}%</span>, about 1 lookup in {Math.round(1 / fp).toLocaleString("en-US")} for a key that isn't there.
        </div>
      </div>
      <Provenance sim="computed in your browser: the bits from the hashint4 port with double hashing, the rate from the formula" />
    </div>
  );
}
