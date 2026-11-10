"use client";

import { useMemo, useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { FIG_TABLE, Narration, Provenance, Row, Toggle, Words, ring, tint, useReducedMotion } from "@/components/figures/kit";

// basic timestamp ordering, the textbook model, drawn by hand. every transaction gets a timestamp
// when it starts (T1 = 1, T2 = 2, ...), and the serial order is fixed to that: each item keeps the
// largest timestamp that read it (RTS) and wrote it (WTS). an operation that arrives "too late"
// for its timestamp aborts its transaction. the Thomas write rule skips an obsolete write instead.

type Op = { t: number; op: "R" | "W"; x: string };
const P = (s: string): Op[] =>
  s.split(" ").map((w) => {
    const m = /^([RW])(\d)\((\w)\)$/.exec(w)!;
    return { op: m[1] as "R" | "W", t: Number(m[2]), x: m[3] };
  });

const PRESETS: Record<string, Op[]> = {
  "in order": P("R1(A) W1(A) R2(A) W2(A)"),
  "late write": P("R1(A) R2(A) W2(A) W1(A)"),
  "blind writes": P("W2(A) W1(A) R2(A)"),
  "late read": P("W2(B) R1(B) W1(A)"),
};

type Res = { verdict: "ok" | "abort" | "skip" | "dead"; why: string; rts: Record<string, number>; wts: Record<string, number> };

function run(ops: Op[], thomas: boolean): Res[] {
  const rts: Record<string, number> = {};
  const wts: Record<string, number> = {};
  const dead = new Set<number>();
  return ops.map((o) => {
    const r = rts[o.x] ?? 0;
    const w = wts[o.x] ?? 0;
    let verdict: Res["verdict"] = "ok";
    let why: string;
    if (dead.has(o.t)) {
      verdict = "dead";
      why = `T${o.t} was already aborted, so this never runs (it would restart with a new, larger timestamp).`;
    } else if (o.op === "R") {
      if (o.t < w) {
        verdict = "abort";
        why = `T${o.t} wants to read ${o.x}, but T${w} (younger) already wrote it. in timestamp order T${o.t} comes first, so the value it should see is gone: abort T${o.t}.`;
      } else {
        rts[o.x] = Math.max(r, o.t);
        why = `ts ${o.t} ≥ WTS(${o.x}) = ${w}: the read is in order. RTS(${o.x}) becomes ${rts[o.x]}.`;
      }
    } else if (o.t < r) {
      verdict = "abort";
      why = `T${o.t} wants to write ${o.x}, but T${r} (younger) already read it. that read should have seen this write: abort T${o.t}.`;
    } else if (o.t < w) {
      if (thomas) {
        verdict = "skip";
        why = `T${w} (younger) already wrote ${o.x} and nobody younger read in between, so in timestamp order this write would be overwritten anyway. the Thomas write rule just skips it.`;
      } else {
        verdict = "abort";
        why = `T${o.t} wants to write ${o.x}, but T${w} (younger) already wrote it: out of order, abort T${o.t}.`;
      }
    } else {
      wts[o.x] = o.t;
      why = `ts ${o.t} ≥ RTS(${o.x}) = ${r} and ≥ WTS(${o.x}) = ${w}: the write is in order. WTS(${o.x}) becomes ${o.t}.`;
    }
    if (verdict === "abort") dead.add(o.t);
    return { verdict, why, rts: { ...rts }, wts: { ...wts } };
  });
}

const TONE = { ok: "live", abort: "dead", skip: "hot", dead: "faint" } as const;

export function ToLab() {
  const [preset, setPreset] = useState("late write");
  const [thomas, setThomas] = useState(false);
  const ops = PRESETS[preset];
  const res = useMemo(() => run(ops, thomas), [ops, thomas]);
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="schedule =" w="11ch">
          <Words label="schedule" options={Object.keys(PRESETS)} value={preset} onChange={setPreset} />
        </Row>
        <Row k="rule =" w="11ch" last>
          <Toggle on={thomas} onChange={setThomas} label="Thomas write rule">
            Thomas write rule
          </Toggle>
        </Row>
      </div>
      <Steps key={`${preset}${thomas}`} ops={ops} res={res} />
      <Provenance drawn="the textbook model of basic timestamp ordering" />
    </div>
  );
}

function Steps({ ops, res }: { ops: Op[]; res: Res[] }) {
  const s = useStepper(ops.length + 1, { interval: 1800 });
  const reduce = useReducedMotion();
  const done = s.i; // ops 0..i-1 have run
  const last = done > 0 ? res[done - 1] : null;
  const items = [...new Set(ops.map((o) => o.x))].sort();
  return (
    <div {...s.keys} className="grid min-w-0 gap-3 outline-none grid-cols-[minmax(0,1fr)]">
      <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[560px]:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
        <ol className="grid content-start gap-1">
          {ops.map((o, i) => {
            const ran = i < done;
            const r = res[i];
            const now = i === done - 1;
            return (
              <li key={i} className="flex items-center gap-2" style={{ opacity: ran ? 1 : 0.25 }}>
                <span className="w-[2ch] text-[10px] text-faint tabular">{i + 1}</span>
                <span className="w-[4ch] text-faint">T{o.t}</span>
                <span className="rounded-xs px-2 py-0.5" style={{ boxShadow: now ? ring("hot", undefined, 1.5) : ring("line-2"), color: "var(--hi)", textDecoration: ran && r.verdict !== "ok" ? "line-through" : undefined }}>
                  {o.op}
                  {o.t}({o.x})
                </span>
                {ran && (
                  <span className="text-11" style={{ color: `var(--${TONE[r.verdict]})` }}>
                    {r.verdict === "ok" ? "ok" : r.verdict === "abort" ? `abort T${o.t}` : r.verdict === "skip" ? "skipped" : "never runs"}
                  </span>
                )}
              </li>
            );
          })}
          <li className="mt-1 text-[10px] text-faint">timestamps: T1 = 1, T2 = 2. smaller is older, and goes first in the serial order.</li>
        </ol>
        <div className="min-w-0">
          <table className={`w-full border-collapse text-12 tabular ${FIG_TABLE}`} aria-label="read and write timestamps per item">
            <thead>
              <tr>
                <th className="border-0 px-2 py-1 text-left text-faint">item</th>
                <th className="border-0 px-2 py-1 text-right text-faint">RTS</th>
                <th className="border-0 px-2 py-1 text-right text-faint">WTS</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x} className="border-t border-line">
                  <td className="px-2 py-1 text-hi">{x}</td>
                  {(["rts", "wts"] as const).map((f) => {
                    const v = last ? (last[f][x] ?? 0) : 0;
                    const pv = done > 1 ? (res[done - 2][f][x] ?? 0) : 0;
                    return (
                      <td key={f} className="px-2 py-1 text-right" style={{ color: v !== pv ? "var(--hot)" : "var(--meta)", background: v !== pv ? tint("hot", 8) : undefined }}>
                        {v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Narration minLines={3}>{last ? last.why : "each item starts with RTS = WTS = 0. step through the schedule."}</Narration>
      <StepControls s={s} compact={reduce} />
    </div>
  );
}
