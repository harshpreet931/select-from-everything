"use client";

import { useMemo, useState } from "react";
import { Legend, NARR, Provenance, Row, Words, tint } from "@/components/figures/kit";

// a model, not postgres: four clients hit the same rows, all fail with 40001 at t = 0, and retry.
// each retry waits base × 2^(attempt-1) ms (capped). without jitter every client picks the same
// delay, so they arrive together again and collide again. with full jitter each one sleeps a
// random time in [0, that delay), and they spread out. "roll again" reseeds the random numbers.

const CLIENTS = 4;
const BASE = 100;
const CAP = 1600;
const ATTEMPTS = 3;
const SPAN = 1000;
const NEAR = 25; // two retries closer than this land on the same rows at the same time

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clashAt = (at: number[], ms: number) => at.filter((y) => Math.abs(y - ms) < NEAR).length > 1;

export function BackoffLab() {
  const [jitter, setJitter] = useState<"none" | "full">("none");
  const [seed, setSeed] = useState(7);
  const lanes = useMemo(() => {
    const rnd = mulberry32(seed);
    return Array.from({ length: ATTEMPTS }, (_, a) => {
      const ceil = Math.min(CAP, BASE * 2 ** a);
      const at = Array.from({ length: CLIENTS }, () => Math.round(jitter === "none" ? ceil : rnd() * ceil));
      const clashes = at.filter((x, i) => at.some((y, j) => j !== i && Math.abs(x - y) < NEAR)).length;
      return { ceil, at, clashes };
    });
  }, [jitter, seed]);
  const total = lanes.reduce((n, l) => n + l.clashes, 0);
  const x = (ms: number) => `${(ms / SPAN) * 100}%`;

  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="jitter =" w="9ch">
          <Words label="jitter" options={["none", "full"]} value={jitter} onChange={setJitter} />
        </Row>
        <Row k="random =" w="9ch" last>
          <button type="button" className="act" disabled={jitter === "none"} onClick={() => setSeed((s) => s + 1)}>
            roll again
          </button>
        </Row>
      </div>
      <div className="grid gap-2" role="img" aria-label={`retry times for ${CLIENTS} clients over ${ATTEMPTS} attempts, jitter ${jitter}: ${total} retries land within ${NEAR} ms of another`}>
        {lanes.map((l, a) => (
          <div key={a} className="grid grid-cols-[6.5ch_minmax(0,1fr)] items-center gap-2">
            <span className="text-11 text-faint">retry {a + 1}</span>
            <div className="relative h-7 rounded-xs bg-well shadow-[inset_0_0_0_1px_var(--line)]">
              <div className="absolute inset-y-0 left-0 rounded-l-xs" style={{ width: x(l.ceil), background: tint("hot", 7), borderRight: "1px dashed var(--mute)" }} />
              {l.at.map((ms, c) => (
                <span
                  key={c}
                  className="absolute top-1/2 size-[10px] -translate-x-1/2 rounded-full transition-[left] duration-300 ease-sfe"
                  style={{ left: x(ms), marginTop: -5 + (c - (CLIENTS - 1) / 2) * 3, background: clashAt(l.at, ms) ? "var(--hot)" : "var(--hi)", boxShadow: "0 0 0 1.5px var(--well)" }}
                  title={`client ${c + 1}: ${ms} ms`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[6.5ch_minmax(0,1fr)] gap-2 text-[10px] text-faint">
          <span />
          <div className="flex justify-between">
            <span>0 ms</span>
            <span>{SPAN} ms after the failure</span>
          </div>
        </div>
      </div>
      <p className={NARR} aria-live="polite">
        {jitter === "none"
          ? `every client waits exactly ${lanes.map((l) => l.ceil).join(", then ")} ms. all four arrive together each time, and fight over the same rows again.`
          : total
            ? `each client picks its own wait under the dashed line. ${total} of the ${CLIENTS * ATTEMPTS} retries still land within ${NEAR} ms of another; most don't.`
            : `each client picks its own wait under the dashed line, and no two retries land within ${NEAR} ms of each other.`}
      </p>
      <Legend
        items={[
          ["hot", `within ${NEAR} ms of another retry`],
          ["hi", "alone"],
          ["mute", "the backoff ceiling", "dashed"],
        ]}
      />
      <Provenance sim={`model: ${CLIENTS} clients that failed at the same moment, backoff ${BASE} ms doubling, not postgres output`} />
    </div>
  );
}
