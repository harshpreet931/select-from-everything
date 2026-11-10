"use client";

import { useState } from "react";
import { NARR, Provenance, Row, Slider, tint } from "@/components/figures/kit";

// spanner's commit wait, as a model (Corbett et al., OSDI 2012): TT.now() returns an interval
// [earliest, latest] of width 2ε that contains the true time. a transaction picks its commit
// timestamp s = TT.now().latest, then waits until TT.now().earliest > s before it reveals the
// commit. so s is in the past everywhere by the time anyone can see the write, and a transaction
// that starts afterwards gets a later timestamp. the wait is about 2ε.

export function CommitWait() {
  const [eps, setEps] = useState(4);
  const span = 20; // ms shown
  const t0 = 4; // true time when the commit timestamp is picked
  const s = t0 + eps;
  const done = s + eps; // true time when earliest passes s
  const x = (t: number) => `${(t / span) * 100}%`;
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="ε =" w="5ch" last>
        <Slider k="clock uncertainty epsilon" min={1} max={7} step={0.5} value={eps} onChange={setEps} format={(v) => `${v} ms`} />
      </Row>
      <div className="grid gap-2" role="img" aria-label={`with epsilon ${eps} ms, the commit waits about ${2 * eps} ms`}>
        {[
          { label: "pick s", at: t0, note: "TT.now() = [t − ε, t + ε]; s = latest" },
          { label: "wait", at: done, note: "until TT.now().earliest > s" },
        ].map((r) => (
          <div key={r.label} className="grid grid-cols-[7ch_minmax(0,1fr)] items-center gap-2">
            <span className="text-mute">{r.label}</span>
            <div className="relative h-7 rounded-xs bg-well-2">
              <div className="absolute inset-y-1 rounded-xs transition-[left,width] duration-300 ease-sfe" style={{ left: x(r.at - eps), width: x(2 * eps), background: tint("meta", 18), boxShadow: "inset 0 0 0 1px var(--meta)" }} title="the TrueTime interval" />
              <div className="absolute inset-y-0 w-px bg-hi transition-[left] duration-300 ease-sfe" style={{ left: x(r.at) }} title="true time" />
              <div className="absolute inset-y-[-3px] w-[2px] bg-hot transition-[left] duration-300 ease-sfe" style={{ left: x(s) }} title="the commit timestamp s" />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[7ch_minmax(0,1fr)] gap-2">
          <span />
          <div className="relative h-5">
            <div className="absolute top-1 h-[2px] rounded-full bg-mute transition-[left,width] duration-300 ease-sfe" style={{ left: x(t0), width: x(done - t0) }} />
            <span className="absolute top-2 text-[10.5px] text-mute transition-[left] duration-300 ease-sfe" style={{ left: x(t0) }}>commit wait ≈ {2 * eps} ms</span>
          </div>
        </div>
      </div>
      <p className={NARR} aria-live="polite">
        the <span className="text-meta">interval</span> is all a server knows about the time. it stamps the commit with the interval's latest end (<span className="text-hot">s</span>), then holds the result back until even the earliest possible time is past s: about 2ε = {2 * eps} ms. after that, no clock anywhere can hand a later transaction a smaller timestamp.
      </p>
      <Provenance sim="model of TrueTime commit wait, after Corbett et al. (2012). the slider range is the 1 to 7 ms the paper reports for ε" />
    </div>
  );
}
