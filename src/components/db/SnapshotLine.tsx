"use client";

import { useState } from "react";
import { Legend, NARR, Row, Slider, fmt, ring, tint, tv, useSvgId } from "@/components/figures/kit";
import type { SnapView, Xid, XactStatus } from "@/lib/db/views";
import { snapText } from "@/lib/db/visibility";
import { describeSnapshot } from "@/lib/db/describe";

// a snapshot on the xid number line. xmin and xmax are brackets (meta), the xids still
// running when it was taken are marked (meta dots, the xip list). every xid is drawn by
// commit status (solid committed, dashed in progress, dead aborted) and tinted live if
// this snapshot sees its writes. click an xid for the verdict.
// ring mode: the 32-bit xid space as a circle. half of it is the past, half the future,
// relative to the current xid. drag the current xid and watch an unfrozen row's xmin slide
// out of the past: wraparound.
//
//   <SnapshotLine snap={{ xmin: 754, xmax: 757, xip: [754] }} xact={{ 752: "committed", 753: "aborted", 754: "in progress", 755: "committed" }} />
//   <SnapshotLine ring={{ xmin: 1_000_000 }} />


function verdict(x: Xid, v: SnapView): { visible: boolean; why: string } {
  const st: XactStatus | undefined = v.xact[x];
  if (st === undefined && v.me !== x) return { visible: false, why: `nothing in this figure used xid ${x}.` };
  if (v.me === x) return { visible: true, why: `${x} is this transaction itself: it always sees its own writes.` };
  if (x >= v.snap.xmax) return { visible: false, why: `${x} ≥ xmax ${v.snap.xmax}: it hadn't started when the snapshot was taken. invisible, whatever happens to it later.` };
  if (v.snap.xip.includes(x)) return { visible: false, why: `${x} is in the xip list: it was still running at snapshot time. invisible, even if it commits a second later.` };
  if (st === "aborted") return { visible: false, why: `${x} aborted: its writes never happened.` };
  if (x < v.snap.xmin) return { visible: st !== "in progress", why: `${x} < xmin ${v.snap.xmin}: finished before every running transaction began, so its fate is settled. committed: visible.` };
  return { visible: true, why: `${x} finished before the snapshot and committed: visible.` };
}

export function SnapshotLine(props: (SnapView & { ring?: undefined }) | { ring: { xmin: number; frozen?: boolean; current?: number }; snap?: undefined; xact?: undefined }) {
  if (props.ring) return <Ring {...props.ring} />;
  return <Line {...(props as SnapView)} />;
}

function Line(v: SnapView) {
  const xs = Object.keys(v.xact).map(Number);
  const lo = v.range?.[0] ?? Math.min(v.snap.xmin - 1, ...xs);
  const hi = v.range?.[1] ?? Math.max(v.snap.xmax + 1, ...xs);
  const ids = Array.from({ length: Math.max(1, hi - lo + 1) }, (_, i) => lo + i).slice(0, 40);
  const [pick, setPick] = useState<Xid | undefined>(v.snap.xip[0] ?? ids.find((x) => v.xact[x] === "in progress") ?? ids.find((x) => v.xact[x]) ?? ids[0]);
  const pv = pick !== undefined ? verdict(pick, v) : undefined;
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="text-11 text-meta">snapshot {snapText(v.snap)}</div>
      <div className="min-w-0 overflow-x-auto pb-1">
        <div className="flex min-w-max items-end gap-[3px] pt-5" role="group" aria-label={describeSnapshot(v)}>
          {ids.map((x) => {
            const st = v.xact[x];
            const vis = st !== undefined && verdict(x, v).visible;
            const inXip = v.snap.xip.includes(x);
            const isMin = x === v.snap.xmin;
            const isMax = x === v.snap.xmax;
            const sel = pick === x;
            return (
              <div key={x} className="relative flex flex-col items-center">
                {(isMin || isMax) && (
                  <span className="absolute -top-5 text-[10px] whitespace-nowrap text-meta">
                    {isMin && isMax ? "[ xmin = xmax )" : isMin ? "[ xmin" : "xmax )"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPick(x)}
                  aria-pressed={sel}
                  aria-label={`xid ${x}${st ? `, ${st}` : ""}${inXip ? ", running at snapshot time" : ""}`}
                  className="flex h-9 w-[3.1rem] flex-col items-center justify-center rounded-xs text-11 tabular transition-[box-shadow,background-color] duration-200 ease-sfe"
                  style={{
                    boxShadow: sel ? ring("hot", undefined, 1.5) : st === "aborted" ? ring("dead", 70) : st === "in progress" || !st ? undefined : ring("line-2"),
                    outline: !sel && (st === "in progress" || !st) ? `1px dashed ${st ? "var(--mute)" : "var(--line)"}` : undefined,
                    outlineOffset: -1,
                    background: vis ? tint("live", 14) : undefined,
                    color: st === "aborted" ? "var(--dead)" : st ? "var(--hi)" : "var(--faint)",
                  }}
                >
                  {x}
                  {inXip && <span className="mt-0.5 size-[5px] rounded-full" style={{ background: "var(--meta)" }} />}
                  {v.me === x && <span className="text-[9px] leading-none text-faint">me</span>}
                </button>
                <span className="mt-1 h-1 w-[3.1rem]" style={{ background: x >= v.snap.xmin && x < v.snap.xmax ? tint("meta", 35) : undefined }} />
              </div>
            );
          })}
        </div>
      </div>
      <p className={NARR} aria-live="polite">
        {pv && pick !== undefined ? (
          <>
            <span className="font-mono text-11 text-hot">{pick}</span> <span style={{ color: pv.visible ? "var(--live)" : "var(--mute)" }}>{pv.visible ? "visible:" : "invisible:"}</span> {pv.why}
          </>
        ) : (
          "click an xid."
        )}
      </p>
      <Legend
        items={[
          ["meta", "xmin..xmax, running at snapshot time (●)"],
          ["live", "writes visible to this snapshot"],
          ["mute", "in progress", "dashed"],
          ["dead", "aborted"],
        ]}
      />
    </div>
  );
}

const SPACE = 2 ** 32;
const HALF = 2 ** 31;

function Ring({ xmin, frozen: frozen0 = false, current: current0 }: { xmin: number; frozen?: boolean; current?: number }) {
  const id = useSvgId();
  const [cur, setCur] = useState(current0 ?? xmin + 150_000_000);
  const [frozen, setFrozen] = useState(frozen0);
  const age = (cur - xmin + SPACE) % SPACE;
  const past = age < HALF;
  const ok = frozen || past;
  const R = 92;
  const C = 120;
  const pt = (x: number, r = R) => {
    const a = (x / SPACE) * 2 * Math.PI - Math.PI / 2;
    return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
  };
  // the half circle behind the current xid is "the past"
  const arc = (from: number, to: number, r: number) => {
    const [x1, y1] = pt(from, r);
    const [x2, y2] = pt(to, r);
    return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const [cx, cy] = pt(cur, R);
  const [rx, ry] = pt(xmin, R);
  const freezeAge = 200_000_000;
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="current xid =" w="14ch">
        <Slider k="current xid" min={0} max={SPACE - 1} step={1_000_000} value={cur} onChange={setCur} format={(x) => fmt(x)} />
      </Row>
      <Row k="the row =" w="14ch" last>
        <button type="button" className="word" aria-pressed={!frozen} onClick={() => setFrozen(false)}>
          xmin {fmt(xmin)}
        </button>
        <button type="button" className="word" aria-pressed={frozen} onClick={() => setFrozen(true)}>
          frozen
        </button>
      </Row>
      <div className="grid items-center gap-4 @min-[520px]:grid-cols-[240px_minmax(0,1fr)]">
        <svg viewBox="0 0 240 250" className="mx-auto block w-full max-w-[240px]" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={`xid ring: current ${fmt(cur)}, the row's xmin is ${fmt(age)} transactions old`}>
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--line-2)" strokeDasharray="2 3" />
          <path d={arc((cur - HALF + SPACE) % SPACE, cur, R)} fill="none" stroke="var(--live)" strokeWidth={6} opacity={0.35} />
          <path d={arc(cur, (cur + HALF) % SPACE, R)} fill="none" stroke="var(--line-2)" strokeWidth={6} opacity={0.6} />
          <text x={C} y={C + R + 20} textAnchor="middle" fontSize={9} fill="var(--faint)">
            2³² xids, wrapping
          </text>
          {(() => {
            const [px, py] = pt((cur - HALF / 2 + SPACE) % SPACE, R - 22);
            const [fx, fy] = pt((cur + HALF / 2) % SPACE, R - 22);
            return (
              <>
                <text x={px} y={py + 3} textAnchor="middle" fontSize={10} fill="var(--live)">
                  past
                </text>
                <text x={fx} y={fy + 3} textAnchor="middle" fontSize={10} fill="var(--faint)">
                  future
                </text>
              </>
            );
          })()}
          {/* the anti-wraparound autovacuum line: 200 million behind the current xid */}
          {(() => {
            const [a, b] = pt((cur - freezeAge + SPACE) % SPACE, R - 10);
            const [c, d] = pt((cur - freezeAge + SPACE) % SPACE, R + 10);
            return <line x1={a} y1={b} x2={c} y2={d} stroke="var(--meta)" strokeWidth={1.5} />;
          })()}
          <line x1={C} y1={C} x2={cx} y2={cy} stroke="var(--hot)" strokeWidth={2} markerEnd={`url(#${id}-h)`} />
          <defs>
            <marker id={`${id}-h`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0.6 L7.4 4 L0 7.4 z" fill="var(--hot)" />
            </marker>
          </defs>
          <circle cx={rx} cy={ry} r={6} fill={ok ? tv("live") : "var(--bg)"} stroke={ok ? "var(--live)" : "var(--dead)"} strokeWidth={1.5} strokeDasharray={ok ? undefined : "2 2"} />
        </svg>
        <div className="grid gap-2">
          <div className="text-11 text-mute tabular">
            age(xmin) = <span className={past ? "text-hi" : "text-dead"}>{fmt(past ? age : age - SPACE)}</span>
            <span className="text-faint"> · </span>
            <span className="text-meta">autovacuum freezes past 200,000,000</span>
          </div>
          <p className={NARR} aria-live="polite">
            {frozen
              ? "frozen: the row is marked as older than every xid, so it stays visible however far the counter goes. that's what VACUUM's freezing is for."
              : past
                ? `xmin ${fmt(xmin)} is ${fmt(age)} transactions in the past: visible. ${age > freezeAge ? "it's past the freeze age: an anti-wraparound vacuum would freeze it now." : ""}`
                : `xmin ${fmt(xmin)} is now more than 2³¹ behind, which wraps around to "in the future". an unfrozen row would vanish. postgres refuses to get here: it stops assigning xids long before.`}
          </p>
        </div>
      </div>
      <Legend
        items={[
          ["live", "the past: visible xids"],
          ["hot", "current xid"],
          ["meta", "freeze age line"],
          ["dead", "the row, once it wraps", "dashed"],
        ]}
      />
    </div>
  );
}
