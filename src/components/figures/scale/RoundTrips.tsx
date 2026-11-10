"use client";

import { useState } from "react";
import { Legend, NARR, Provenance, Row, Slider, Words, tint } from "@/components/figures/kit";

// a model of one page load: how many statements cross the network, and what each round trip
// adds. the "on this machine" times are measured (data/measured.json: client and server on one
// mac, so almost no network); the slider adds a network round trip per statement on top. it's
// arithmetic on measured numbers, not a measurement of a real network.

type Way = "lazy (N+1)" | "eager, JOIN" | "eager, = ANY";
const WAYS: Way[] = ["lazy (N+1)", "eager, JOIN", "eager, = ANY"];

export function RoundTrips({ local }: { local: Record<Way, number> }) {
  const [way, setWay] = useState<Way>("lazy (N+1)");
  const [n, setN] = useState(100);
  const [rtt, setRtt] = useState(0.5);
  const stmts = (w: Way) => (w === "lazy (N+1)" ? 1 + n : w === "eager, JOIN" ? 1 : 2);
  // the measured page was 100 orders; the per-row part of the work scales with n
  const work = (w: Way) => (w === "lazy (N+1)" ? (local[w] / 101) * (1 + n) : local[w] * (0.3 + 0.7 * (n / 100)));
  const total = (w: Way) => work(w) + stmts(w) * rtt;
  const max = Math.max(...WAYS.map(total));
  const shown = Math.min(stmts(way), 60);
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="loading =" w="12ch">
          <Words label="loading strategy" options={WAYS} value={way} onChange={setWay} />
        </Row>
        <Row k="orders =" w="12ch">
          <Slider k="orders on the page" min={10} max={500} step={10} value={n} onChange={setN} />
        </Row>
        <Row k="round trip =" w="12ch" last>
          <Slider k="network round trip" min={0} max={2} step={0.1} value={rtt} onChange={setRtt} format={(v) => `${v.toFixed(1)} ms`} />
        </Row>
      </div>
      <div className="grid gap-1" role="img" aria-label={`${stmts(way)} statements, about ${total(way).toFixed(1)} ms per page`}>
        <div className="text-11 text-faint">
          statements sent for one page: <span className="text-hi">{stmts(way).toLocaleString("en-US")}</span>
        </div>
        <div className="flex flex-wrap gap-[3px]">
          {Array.from({ length: shown }, (_, i) => (
            <span key={i} className="h-3 w-3 rounded-[2px]" style={{ background: i === 0 ? "var(--hi)" : way === "lazy (N+1)" ? tint("dead", 55) : tint("live", 55) }} title={i === 0 ? "the list query" : "a follow-up query"} />
          ))}
          {stmts(way) > shown && <span className="text-11 text-faint">+{(stmts(way) - shown).toLocaleString("en-US")} more</span>}
        </div>
      </div>
      <div className="grid gap-1.5">
        {WAYS.map((w) => (
          <div key={w} className="grid grid-cols-[13ch_minmax(0,1fr)_8ch] items-center gap-2">
            <span className={w === way ? "text-hi" : "text-mute"}>{w}</span>
            <div className="relative h-4 rounded-xs bg-well-2">
              <div className="absolute inset-y-0 left-0 rounded-l-xs transition-[width] duration-300 ease-sfe" style={{ width: `${(work(w) / max) * 100}%`, background: "var(--mute)" }} />
              <div className="absolute inset-y-0 rounded-r-xs transition-[left,width] duration-300 ease-sfe" style={{ left: `${(work(w) / max) * 100}%`, width: `${((stmts(w) * rtt) / max) * 100}%`, background: w === "lazy (N+1)" ? "var(--dead)" : "var(--live)", opacity: 0.75 }} />
            </div>
            <span className="text-right tabular text-hi">{total(w).toFixed(1)} ms</span>
          </div>
        ))}
      </div>
      <p className={NARR} aria-live="polite">
        {way === "lazy (N+1)"
          ? `${(1 + n).toLocaleString("en-US")} statements. each one pays a round trip, so at ${rtt.toFixed(1)} ms the network alone adds ${((1 + n) * rtt).toFixed(0)} ms, whatever the database does.`
          : way === "eager, JOIN"
            ? `one statement, one round trip. the database does all the matching, and the network cost doesn't grow with the number of orders.`
            : `two statements: the list, then every child row for all the ids at once. two round trips, however many orders.`}
      </p>
      <Legend items={[["mute", "work, timed on one machine"], ["dead", "round trips (N+1)"], ["live", "round trips (eager)"]]} />
      <Provenance sim="model: the grey part is measured on one machine with the shop dataset and scaled by the number of orders; the coloured part is statements × the round trip you pick" />
    </div>
  );
}
