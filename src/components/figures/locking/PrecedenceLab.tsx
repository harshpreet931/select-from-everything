"use client";

import { useMemo, useState } from "react";
import { Heads, Legend, Provenance, Row, Words, NARR, headId, ring, tint, useSvgId } from "@/components/figures/kit";

// the textbook model of conflict serializability, drawn by hand: a schedule of reads and writes,
// its precedence graph (Ti → Tj when an op of Ti conflicts with a later op of Tj: same item, at
// least one write), and the verdict. the reader moves operations up and down; a transaction's
// own operations keep their order. a cycle (in dead) means not conflict serializable; no cycle
// gives the equivalent serial order (live).

type Op = { t: number; op: "R" | "W"; x: string };
type Preset = { label: string; ops: Op[] };

const P = (s: string): Op[] =>
  s.split(" ").map((w) => {
    const m = /^([RW])(\d)\((\w)\)$/.exec(w)!;
    return { op: m[1] as "R" | "W", t: Number(m[2]), x: m[3] };
  });

const PRESETS: Preset[] = [
  { label: "serial", ops: P("R1(A) W1(A) R1(B) W1(B) R2(A) W2(A) R2(B) W2(B)") },
  { label: "interleaved", ops: P("R1(A) W1(A) R2(A) W2(A) R1(B) W1(B) R2(B) W2(B)") },
  { label: "lost update", ops: P("R1(A) R2(A) W1(A) W2(A)") },
  { label: "three", ops: P("R1(A) R2(B) W2(A) R3(C) W3(B) W1(C)") },
];

type Edge = { from: number; to: number; why: string[] };

function analyse(ops: Op[]) {
  const ts = [...new Set(ops.map((o) => o.t))].sort();
  const map = new Map<string, Edge>();
  ops.forEach((a, i) =>
    ops.slice(i + 1).forEach((b, k) => {
      if (a.t === b.t || a.x !== b.x || (a.op === "R" && b.op === "R")) return;
      const key = `${a.t}>${b.t}`;
      const e = map.get(key) ?? { from: a.t, to: b.t, why: [] };
      e.why.push(`${a.op}${a.t}(${a.x}) before ${b.op}${b.t}(${b.x})`);
      map.set(key, e);
      void k;
    }),
  );
  const edges = [...map.values()];
  // topological sort (Kahn); leftovers are on or behind a cycle
  const indeg = new Map(ts.map((t) => [t, 0]));
  edges.forEach((e) => indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1));
  const order: number[] = [];
  const q = ts.filter((t) => indeg.get(t) === 0);
  while (q.length) {
    const t = q.shift()!;
    order.push(t);
    edges.filter((e) => e.from === t).forEach((e) => {
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) q.push(e.to);
    });
  }
  const stuck = new Set(ts.filter((t) => !order.includes(t)));
  // an edge is on a cycle if both ends can reach each other
  const reach = (a: number, b: number) => {
    const seen = new Set<number>();
    const st = [a];
    while (st.length) {
      const n = st.pop()!;
      if (n === b) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      edges.filter((e) => e.from === n).forEach((e) => st.push(e.to));
    }
    return false;
  };
  const cyc = edges.filter((e) => stuck.has(e.from) && stuck.has(e.to) && reach(e.to, e.from));
  return { ts, edges, order: stuck.size ? null : order, cyc };
}

export function PrecedenceLab({ start = 2, provenance = "the textbook model of conflict serializability" }: { start?: number; provenance?: string }) {
  const [preset, setPreset] = useState(PRESETS[start].label);
  const [ops, setOps] = useState<Op[]>(PRESETS[start].ops);
  const [msg, setMsg] = useState<string | null>(null);
  const a = useMemo(() => analyse(ops), [ops]);
  const id = useSvgId();
  const pick = (l: string) => {
    setPreset(l);
    setOps(PRESETS.find((p) => p.label === l)!.ops);
    setMsg(null);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ops.length) return;
    if (ops[i].t === ops[j].t) {
      setMsg(`T${ops[i].t}'s own operations keep their order: a transaction runs its steps in sequence.`);
      return;
    }
    const conflict = ops[i].x === ops[j].x && (ops[i].op === "W" || ops[j].op === "W");
    const n = [...ops];
    [n[i], n[j]] = [n[j], n[i]];
    setOps(n);
    setMsg(
      conflict
        ? `swapped a conflicting pair (${ops[i].op}${ops[i].t}(${ops[i].x}), ${ops[j].op}${ops[j].t}(${ops[j].x})): the edge between them flipped.`
        : `swapped two non-conflicting operations: the graph can't change, so the schedule is equivalent to the one before.`,
    );
  };
  const n = a.ts.length;
  const W = 300;
  const H = n <= 2 ? 130 : 230;
  const pos = new Map(
    a.ts.map((t, k) => {
      const ang = n <= 2 ? Math.PI * k + Math.PI : -Math.PI / 2 + (k * 2 * Math.PI) / n;
      return [t, { x: W / 2 + (n <= 2 ? 95 : 90) * Math.cos(ang), y: (n <= 2 ? 65 : 120) + (n <= 2 ? 0 : 85 * Math.sin(ang)) }];
    }),
  );
  const isCyc = (e: Edge) => a.cyc.some((c) => c.from === e.from && c.to === e.to);
  const both = (e: Edge) => a.edges.some((f) => f.from === e.to && f.to === e.from);
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="schedule =" w="11ch" last>
        <Words label="schedule" options={PRESETS.map((p) => p.label)} value={preset} onChange={pick} />
      </Row>
      <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[600px]:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <ol className="grid gap-1" aria-label="the schedule, in time order">
          {ops.map((o, i) => (
            <li key={`${o.t}${o.op}${o.x}${i}`} className="grid grid-cols-[2ch_repeat(var(--n),minmax(0,1fr))_auto] items-center gap-1" style={{ ["--n" as string]: n }}>
              <span className="text-[10px] text-faint tabular">{i + 1}</span>
              {a.ts.map((t) => (
                <span key={t} className="flex justify-center">
                  {o.t === t && (
                    <span className="rounded-xs px-2 py-0.5" style={{ boxShadow: ring(o.op === "W" ? "hi" : "line-2"), background: o.op === "W" ? tint("hot", 8) : undefined, color: "var(--hi)" }}>
                      {o.op}
                      {o.t}({o.x})
                    </span>
                  )}
                </span>
              ))}
              <span className="flex gap-0.5">
                <button type="button" className="act px-1.5 text-11" aria-label={`move ${o.op}${o.t}(${o.x}) earlier`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="act px-1.5 text-11" aria-label={`move ${o.op}${o.t}(${o.x}) later`} disabled={i === ops.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
              </span>
            </li>
          ))}
          <li className="grid grid-cols-[2ch_repeat(var(--n),minmax(0,1fr))_auto] gap-1 text-[10px] text-faint" style={{ ["--n" as string]: n }}>
            <span />
            {a.ts.map((t) => (
              <span key={t} className="text-center">
                T{t}
              </span>
            ))}
            <span className="w-[54px]" />
          </li>
        </ol>
        <div className="grid content-start gap-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[300px]" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={`precedence graph: ${a.edges.map((e) => `T${e.from} → T${e.to}`).join(", ") || "no edges"}`}>
            <Heads id={id} tones={["ink", "dead"]} />
            {a.edges.map((e) => {
              const p = pos.get(e.from)!;
              const q = pos.get(e.to)!;
              const dx = q.x - p.x;
              const dy = q.y - p.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const r = 24;
              const bend = both(e) ? 22 : 0;
              const x1 = p.x + ux * r;
              const y1 = p.y + uy * r;
              const x2 = q.x - ux * (r + 3);
              const y2 = q.y - uy * (r + 3);
              const mx = (x1 + x2) / 2 - uy * bend;
              const my = (y1 + y2) / 2 + ux * bend;
              const c = isCyc(e);
              // the label sits just outside the curve: on the bend side for a two-way pair, else away from the centre
              const cx0 = W / 2;
              const cy0 = n <= 2 ? 65 : 120;
              const d = bend / 2 + 11;
              const plus = { x: (x1 + x2) / 2 - uy * d, y: (y1 + y2) / 2 + ux * d };
              const minus = { x: (x1 + x2) / 2 + uy * 11, y: (y1 + y2) / 2 - ux * 11 };
              const far = (q: { x: number; y: number }) => Math.hypot(q.x - cx0, q.y - cy0);
              const lab = bend || far(plus) >= far(minus) ? plus : minus;
              return (
                <g key={`${e.from}-${e.to}`}>
                  <title>{e.why.join("; ")}</title>
                  <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke={c ? "var(--dead)" : "var(--ink)"} strokeWidth={1.5} strokeDasharray={c ? "5 4" : undefined} markerEnd={`url(#${headId(id, c ? "dead" : "ink")})`} />
                  <text x={lab.x} y={lab.y + 3} textAnchor="middle" fontSize={9.5} fill={c ? "var(--dead)" : "var(--mute)"} stroke="var(--well)" strokeWidth={4} paintOrder="stroke">
                    {e.why[0].split(" before ").map((s) => s.replace(/\d\(/, "(")).join(" → ")}
                  </text>
                </g>
              );
            })}
            {a.ts.map((t) => {
              const p = pos.get(t)!;
              return (
                <g key={t}>
                  <circle cx={p.x} cy={p.y} r={20} fill="var(--well)" stroke="var(--line-2)" strokeWidth={1.2} />
                  <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fill="var(--hi)">
                    T{t}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className={NARR} aria-live="polite">
            {a.order ? (
              <>
                <span style={{ color: "var(--live)" }}>conflict serializable.</span> no cycle, so it's equivalent to running {a.order.map((t) => `T${t}`).join(" then ")}, one at a time.
              </>
            ) : (
              <>
                <span style={{ color: "var(--dead)" }}>not conflict serializable.</span> the graph has a cycle, so no serial order puts every conflicting pair in the same order as this schedule.
              </>
            )}
          </p>
        </div>
      </div>
      <p className={`${NARR} text-mute`} aria-live="polite" style={{ minHeight: "1.6em" }}>
        {msg ?? "move an operation with ↑ ↓. edges come from conflicting pairs: same item, different transactions, at least one write."}
      </p>
      <Legend
        items={[
          ["ink", "Ti → Tj: an op of Ti conflicts with a later op of Tj", "line"],
          ["dead", "an edge on a cycle", "dashed"],
        ]}
      />
      <Provenance drawn={provenance} />
    </div>
  );
}
