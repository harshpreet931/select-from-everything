"use client";

import { useMemo, useState } from "react";
import { Legend, NARR, Provenance, Row, Words, ring, tint } from "@/components/figures/kit";

// a history checker for one register x (initially 0), textbook definitions:
//   linearizable  some total order of all operations that respects real time (a ends before b
//                 starts ⇒ a first) in which every read returns the latest write before it
//   sequential    the same, but only each process's own order has to be respected
//   causal        happens-before = program order + reads-from, transitively; each process must
//                 be able to explain its reads by some order of all writes and its own ops that
//                 respects happens-before
//   read your writes, monotonic reads: the session guarantees (Terry et al.), judged against
//                 happens-before
// histories are tiny, so every order is tried. written values are unique, so a read's value
// says which write it saw.

type Op = { id: number; p: number; kind: "w" | "r"; v: number; s: number; e: number };
const SLOTS = 12;
const PROCS = ["P1", "P2", "P3"];

const PRESETS: Record<string, Op[]> = {
  "fresh reads": [
    { id: 0, p: 0, kind: "w", v: 1, s: 0, e: 2 },
    { id: 1, p: 1, kind: "r", v: 1, s: 3, e: 4 },
    { id: 2, p: 2, kind: "r", v: 1, s: 5, e: 7 },
  ],
  "stale read": [
    { id: 0, p: 0, kind: "w", v: 1, s: 0, e: 2 },
    { id: 1, p: 1, kind: "r", v: 0, s: 3, e: 5 },
    { id: 2, p: 2, kind: "r", v: 1, s: 6, e: 7 },
  ],
  "lost own write": [
    { id: 0, p: 0, kind: "w", v: 1, s: 0, e: 1 },
    { id: 1, p: 0, kind: "r", v: 0, s: 3, e: 4 },
    { id: 2, p: 1, kind: "r", v: 1, s: 2, e: 5 },
  ],
  "time goes back": [
    { id: 0, p: 0, kind: "w", v: 1, s: 0, e: 1 },
    { id: 1, p: 1, kind: "r", v: 1, s: 2, e: 3 },
    { id: 2, p: 1, kind: "r", v: 0, s: 5, e: 6 },
  ],
  "effect before cause": [
    { id: 0, p: 0, kind: "w", v: 1, s: 0, e: 1 },
    { id: 1, p: 1, kind: "r", v: 1, s: 2, e: 3 },
    { id: 2, p: 1, kind: "w", v: 2, s: 4, e: 5 },
    { id: 3, p: 2, kind: "r", v: 2, s: 6, e: 7 },
    { id: 4, p: 2, kind: "r", v: 1, s: 8, e: 9 },
  ],
};

function perms<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
}

/** reads in this order all return the latest write before them (0 if none) */
function legal(order: Op[], only?: Set<number>): boolean {
  let cur = 0;
  for (const o of order) {
    if (o.kind === "w") cur = o.v;
    else if ((!only || only.has(o.id)) && o.v !== cur) return false;
  }
  return true;
}

function respects(order: Op[], before: (a: Op, b: Op) => boolean): boolean {
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) if (before(order[j], order[i])) return false;
  return true;
}

type Verdict = { ok: boolean; why: string };

function check(ops: Op[]): Record<string, Verdict> {
  const prog = (a: Op, b: Op) => a.p === b.p && a.e < b.s;
  const real = (a: Op, b: Op) => a.e < b.s;
  const src = (r: Op) => ops.find((w) => w.kind === "w" && w.v === r.v) ?? null;
  // happens-before: program order + reads-from, closed transitively
  const n = ops.length;
  const idx = new Map(ops.map((o, i) => [o.id, i]));
  const hb: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  ops.forEach((a, i) =>
    ops.forEach((b, j) => {
      if (prog(a, b)) hb[i][j] = true;
      if (b.kind === "r" && a.kind === "w" && src(b)?.id === a.id) hb[i][j] = true;
    }),
  );
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (hb[i][k] && hb[k][j]) hb[i][j] = true;
  const before = (a: Op, b: Op) => hb[idx.get(a.id)!][idx.get(b.id)!];
  const all = perms(ops);
  const lin = all.some((o) => respects(o, real) && legal(o));
  const seq = all.some((o) => respects(o, prog) && legal(o));
  const writes = ops.filter((o) => o.kind === "w");
  let causalBad = "";
  for (let p = 0; p < PROCS.length && !causalBad; p++) {
    const mine = ops.filter((o) => o.p === p);
    if (!mine.some((o) => o.kind === "r")) continue;
    const view = [...new Map([...writes, ...mine].map((o) => [o.id, o])).values()];
    const ok = perms(view).some((o) => respects(o, before) && legal(o, new Set(mine.map((m) => m.id))));
    if (!ok) causalBad = `${PROCS[p]}'s reads can't be explained by any order of the writes that respects cause and effect.`;
  }
  let ryw = "";
  let mr = "";
  for (const r of ops.filter((o) => o.kind === "r")) {
    const s = src(r);
    const own = ops.filter((w) => w.kind === "w" && w.p === r.p && prog(w, r)).pop();
    if (own && !ryw && (s === null || (s.id !== own.id && before(s, own)))) ryw = `${PROCS[r.p]} wrote ${own.v}, then read ${r.v}: older than its own write.`;
    const earlier = ops.filter((o) => o.kind === "r" && o.p === r.p && prog(o, r));
    for (const e of earlier) {
      const se = src(e);
      if (se && !mr && (s === null || (s.id !== se.id && before(s, se)))) mr = `${PROCS[r.p]} read ${e.v}, then ${r.v}: a later read saw an older value.`;
    }
  }
  return {
    linearizable: { ok: lin, why: lin ? "there's an order that fits real time and every read." : "no order fits both real time and every read: some read missed a write that had already finished." },
    sequential: { ok: seq, why: seq ? "there's an order that keeps each process's own order and fits every read." : "no order fits every read while keeping each process's own order." },
    causal: { ok: !causalBad, why: causalBad || "every process sees causes before their effects." },
    "read your writes": { ok: !ryw, why: ryw || "no process reads something older than its own last write." },
    "monotonic reads": { ok: !mr, why: mr || "no process sees time go backwards." },
    eventual: { ok: true, why: "can't be broken by a finite history: it only promises that replicas agree once writes stop." },
  };
}

export function HistoryChecker() {
  const [preset, setPreset] = useState("stale read");
  const [ops, setOps] = useState<Op[]>(PRESETS["stale read"]);
  const [sel, setSel] = useState<number>(1);
  const verdicts = useMemo(() => check(ops), [ops]);
  const values = [0, ...ops.filter((o) => o.kind === "w").map((o) => o.v)];
  const cur = ops.find((o) => o.id === sel);
  const load = (k: string) => {
    setPreset(k);
    setOps(PRESETS[k]);
    setSel(PRESETS[k].find((o) => o.kind === "r")?.id ?? 0);
  };
  const shift = (d: number) =>
    setOps((xs) =>
      xs.map((o) => {
        if (o.id !== sel) return o;
        const s = Math.max(0, Math.min(SLOTS - 1 - (o.e - o.s), o.s + d));
        const moved = { ...o, s, e: s + (o.e - o.s) };
        // keep a process's operations from overlapping each other
        const clash = xs.some((x) => x.id !== o.id && x.p === o.p && !(moved.e < x.s || x.e < moved.s));
        return clash ? o : moved;
      }),
    );
  const cycle = (o: Op) => {
    setSel(o.id);
    if (o.kind !== "r") return;
    setOps((xs) => xs.map((x) => (x.id === o.id ? { ...x, v: values[(values.indexOf(x.v) + 1) % values.length] } : x)));
  };
  const pct = (t: number) => `${(t / SLOTS) * 100}%`;
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="history =" w="9ch" last>
        <Words label="preset history" options={Object.keys(PRESETS)} value={preset} onChange={load} />
      </Row>
      <div className="grid gap-1.5" role="group" aria-label="operations on x, one lane per process; click a read to change what it returned">
        {PROCS.map((p, pi) => (
          <div key={p} className="grid grid-cols-[3ch_minmax(0,1fr)] items-center gap-2">
            <span className="text-faint">{p}</span>
            <div className="relative h-8 rounded-xs bg-well-2">
              {ops
                .filter((o) => o.p === pi)
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => cycle(o)}
                    aria-pressed={sel === o.id}
                    title={o.kind === "r" ? "click: change the value this read returned" : "a write"}
                    className="absolute top-1 bottom-1 truncate rounded-xs px-1 text-left text-11 transition-[left,box-shadow] duration-200 ease-sfe"
                    style={{
                      left: pct(o.s),
                      width: `calc(${pct(o.e - o.s + 1)} - 2px)`,
                      boxShadow: ring(sel === o.id ? "hot" : o.kind === "w" ? "hi" : "line-2", sel === o.id ? undefined : o.kind === "w" ? 45 : undefined, sel === o.id ? 1.5 : 1),
                      background: sel === o.id ? tint("hot", 10) : o.kind === "w" ? "var(--well-2)" : "var(--well)",
                      color: "var(--hi)",
                    }}
                  >
                    {o.kind === "w" ? `w(x, ${o.v})` : `r(x) → ${o.v}`}
                  </button>
                ))}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[3ch_minmax(0,1fr)] gap-2 text-[10px] text-faint">
          <span />
          <div className="flex justify-between">
            <span>time →</span>
            <span>each bar runs from the call to the reply</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-faint">selected: {cur ? (cur.kind === "w" ? `${PROCS[cur.p]} w(x, ${cur.v})` : `${PROCS[cur.p]} r(x) → ${cur.v}`) : "none"}</span>
        <button type="button" className="act" onClick={() => shift(-1)}>← earlier</button>
        <button type="button" className="act" onClick={() => shift(1)}>later →</button>
        <button type="button" className="act" onClick={() => load(preset)}>reset</button>
      </div>
      <ul className="grid gap-1" aria-live="polite">
        {Object.entries(verdicts).map(([k, v]) => (
          <li key={k} className="grid grid-cols-1 items-baseline gap-x-2 @min-[520px]:grid-cols-[19ch_minmax(0,1fr)]">
            <span style={{ color: k === "eventual" ? "var(--mute)" : v.ok ? "var(--live)" : "var(--dead)" }}>
              {k === "eventual" ? "~" : v.ok ? "✓" : "✗"} {k}
            </span>
            <span className={`${NARR} !text-[0.95rem] text-mute`}>{v.why}</span>
          </li>
        ))}
      </ul>
      <Legend items={[["live", "holds"], ["dead", "broken"], ["hot", "selected"]]} />
      <Provenance drawn="textbook definitions (Herlihy & Wing; Lamport; Terry et al.), checked by trying every order" />
    </div>
  );
}
