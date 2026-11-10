"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, Provenance, Row, Stat, Words, fmt, ring, tint, useReducedMotion, useWidth } from "@/components/figures/kit";
import { poolSteps } from "@/lib/db/sim/clock";
import type { PoolFrame } from "@/lib/db/views";

// the clock sweep, one tick at a time. the frames sit round a dial; each has a page and a
// usage count (the pips). a request for a page that's already in a frame is a hit: usage + 1,
// up to 5. a miss sends the hand round: every frame it passes with usage above 0 loses 1 and
// survives, and the first frame it finds at 0 is the victim. the requests run through the
// tested model in src/lib/db/sim/clock.ts (StrategyGetBuffer, simplified); this figure only
// splits each miss into the frames the hand passed.
//
//   <ClockDial frames={6} pages={10} presets={[{ label: "one hot page", seq: [0, 1, 0, 2] }]} />

type Tick = {
  frames: PoolFrame[];
  hand: number;
  at: number;
  kind: "start" | "hit" | "sweep" | "victim" | "empty";
  req?: number;
  k: number; // which request (0-based), -1 for the start
  note: string;
  stats: { hit: number; read: number; evicted: number };
};

const lbl = (p?: { block: number }) => (p ? `t·${p.block}` : "empty");

function ticksOf(seq: number[], frames: number): Tick[] {
  const steps = poolSteps(
    seq.map((b) => ({ rel: "t", block: b })),
    { frames, policy: "clock-sweep" },
  );
  const out: Tick[] = [{ frames: steps[0].view.frames, hand: 0, at: -1, kind: "start", k: -1, note: `${frames} empty frames, the hand at frame 0. request pages and watch where they land.`, stats: { hit: 0, read: 0, evicted: 0 } }];
  for (let k = 1; k < steps.length; k++) {
    const prev = steps[k - 1].view;
    const cur = steps[k].view;
    const r = seq[k - 1];
    const stats = { hit: cur.stats.hit, read: cur.stats.read, evicted: cur.stats.evicted };
    const before = { hit: prev.stats.hit, read: prev.stats.read, evicted: prev.stats.evicted };
    const v = cur.victim ?? 0;
    if (cur.hit) {
      const u0 = prev.frames[v].usage;
      const u1 = cur.frames[v].usage;
      out.push({ frames: cur.frames, hand: prev.hand, at: v, kind: "hit", req: r, k: k - 1, stats, note: `t·${r} is already in frame ${v}: a hit. no I/O, and the hand doesn't move. usage ${u0 === u1 ? `stays at ${u1}, the cap` : `${u0} → ${u1}`}.` });
      continue;
    }
    let fr = prev.frames.map((f) => ({ ...f }));
    for (const j of cur.swept ?? []) {
      fr = fr.map((f) => ({ ...f }));
      const u = fr[j].usage;
      fr[j].usage = u - 1;
      out.push({ frames: fr, hand: j, at: j, kind: "sweep", req: r, k: k - 1, stats: before, note: `t·${r} isn't here, so the hand looks for a victim. frame ${j} holds ${lbl(fr[j].page)} with usage ${u}: it loses 1, keeps its page, and the hand moves on.` });
    }
    const was = prev.frames[v].page;
    out.push({
      frames: cur.frames,
      hand: was ? v : prev.hand,
      at: v,
      kind: was ? "victim" : "empty",
      req: r,
      k: k - 1,
      stats,
      note: was
        ? `frame ${v} holds ${lbl(was)} at usage 0: the victim. out goes ${lbl(was)}, in comes t·${r}, read from disk, usage 1.${(cur.swept?.length ?? 0) > 0 ? ` this one miss cost the hand ${cur.swept!.length + 1} frames of walking.` : ""}`
        : `t·${r} isn't here, and frame ${v} has never been used: no victim needed. read from disk, usage 1.`,
    });
  }
  return out;
}

export function ClockDial({ frames: frames0 = 6, pages = 10, presets }: { frames?: number; pages?: number; presets: { label: string; seq: number[] }[] }) {
  const [preset, setPreset] = useState(0);
  const [frames, setFrames] = useState(frames0);
  const [seq, setSeq] = useState<number[]>(presets[0]?.seq ?? []);
  const ticks = useMemo(() => ticksOf(seq, frames), [seq, frames]);
  const reduce = useReducedMotion();
  const s = useStepper(ticks.length, { interval: 700 });
  const jump = useRef<number | null>(null);
  useEffect(() => {
    if (jump.current != null) {
      s.go(jump.current);
      jump.current = null;
    }
  }, [ticks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = ticks[Math.min(s.i, ticks.length - 1)];
  const [wrap, w] = useWidth<HTMLDivElement>(560);
  const D = Math.min(400, Math.max(280, w));
  const R = D / 2 - 40;
  const c = D / 2;
  const pos = (i: number) => {
    const a = -Math.PI / 2 + (i / frames) * Math.PI * 2;
    return [c + R * Math.cos(a), c + R * Math.sin(a)] as const;
  };
  const [hx, hy] = pos(t.hand);
  const boxW = Math.min(64, (2 * Math.PI * R) / frames - 8);

  const choose = (i: number) => {
    setPreset(i);
    setSeq(presets[i].seq);
    s.reset();
  };
  const request = (b: number) => {
    jump.current = ticks.length; // the first tick of the new request
    setSeq((q) => [...q, b]);
  };

  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="clock sweep, one tick at a time">
      <div>
        <Row k="requests =" w="11ch">
          <Words label="request pattern" options={presets.map((p, i) => ({ v: i, label: p.label }))} value={preset} onChange={choose} />
        </Row>
        <Row k="frames =" w="11ch">
          <Words
            label="buffer frames"
            options={[4, 6, 8].map((n) => ({ v: n, label: String(n) }))}
            value={frames}
            onChange={(n) => {
              setFrames(n);
              s.reset();
            }}
          />
        </Row>
        <Row k="read a page" w="11ch" last>
          {Array.from({ length: pages }, (_, b) => (
            <button key={b} type="button" className="act !px-2 !py-0.5 text-11" onClick={() => request(b)} aria-label={`request page t·${b}`}>
              t·{b}
            </button>
          ))}
        </Row>
      </div>

      <div className="flex flex-wrap gap-1" aria-label="the requests, in order">
        {seq.map((b, i) => {
          const now = i === t.k;
          return (
            <span key={i} className="rounded-xs px-1 text-[10px] leading-4 tabular transition-[opacity,box-shadow] duration-200" style={{ boxShadow: now ? ring("hot", undefined, 1.5) : ring("line"), color: now ? "var(--hot)" : "var(--ink)", opacity: i < t.k ? 0.45 : 1 }}>
              t·{b}
            </span>
          );
        })}
      </div>

      <div ref={wrap} className="grid min-w-0 items-center gap-4 grid-cols-[minmax(0,1fr)] @min-[700px]:grid-cols-[auto_minmax(0,1fr)]">
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} className="mx-auto block" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={`${frames} frames on a dial, the hand at frame ${t.hand}`}>
          <circle cx={c} cy={c} r={R} fill="none" stroke="var(--line-2)" strokeDasharray="2 4" />
          <line x1={c} y1={c} x2={c + (hx - c) * 0.62} y2={c + (hy - c) * 0.62} stroke="var(--hot)" strokeWidth={2.5} strokeLinecap="round" style={{ transition: reduce ? undefined : "all 200ms cubic-bezier(0.2,0,0,1)" }} />
          <circle cx={c} cy={c} r={4} fill="var(--hot)" />
          <text x={c} y={c + 26} textAnchor="middle" fontSize={11} fill="var(--mute)">
            {t.req != null ? `read t·${t.req}` : "the hand"}
          </text>
          {t.req != null && (
            <text x={c} y={c + 42} textAnchor="middle" fontSize={11} fill={t.kind === "hit" ? "var(--live)" : "var(--hot)"}>
              {t.kind === "hit" ? "hit" : t.kind === "sweep" ? "sweeping…" : "miss: read it"}
            </text>
          )}
          {t.frames.map((f, i) => {
            const [x, y] = pos(i);
            const focus = t.at === i;
            const stroke = focus ? (t.kind === "hit" ? "var(--live)" : "var(--hot)") : f.page ? "var(--line-2)" : "var(--line-2)";
            return (
              <g key={i}>
                <rect
                  x={x - boxW / 2}
                  y={y - 22}
                  width={boxW}
                  height={44}
                  rx={5}
                  fill={focus ? (t.kind === "hit" ? tint("live", 12) : tint("hot", 12)) : "var(--bg)"}
                  stroke={stroke}
                  strokeWidth={focus ? 1.75 : 1}
                  strokeDasharray={f.page ? undefined : "3 3"}
                />
                <text x={x - boxW / 2 + 4} y={y - 12} fontSize={8.5} fill="var(--faint)">
                  #{i}
                </text>
                <text x={x} y={y + 3} textAnchor="middle" fontSize={11} fill={f.page ? "var(--hi)" : "var(--faint)"} fontStyle={f.page ? undefined : "italic"}>
                  {lbl(f.page)}
                </text>
                {Array.from({ length: 5 }, (_, k) => (
                  <circle key={k} cx={x - 12 + k * 6} cy={y + 13} r={2.2} fill={k < f.usage ? "var(--ink)" : "none"} stroke={k < f.usage ? "none" : "var(--line-2)"} />
                ))}
              </g>
            );
          })}
        </svg>
        <div className="grid min-w-0 content-start gap-3">
          <Narration minLines={4} tag={t.kind === "start" ? "" : t.kind}>
            {t.note}
          </Narration>
          <div className="grid grid-cols-3 gap-3">
            <Stat k="hits" v={fmt(t.stats.hit)} tone="live" />
            <Stat k="reads" v={fmt(t.stats.read)} tone="hot" />
            <Stat k="evictions" v={fmt(t.stats.evicted)} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          ["hot", "the hand, a miss"],
          ["live", "a hit"],
          ["ink", "usage count (pips, 0 to 5)"],
          ["mute", "empty frame", "dashed"],
        ]}
      />
      <StepControls s={s} label="tick" compact={reduce} />
      <Provenance sim="model of the clock sweep (StrategyGetBuffer, freelist.c), simplified: one backend, pins dropped at once, no background writer" />
    </div>
  );
}
