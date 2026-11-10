import { Heads, Legend, headId, useSvgId } from "@/components/figures/kit";
import type { WfgView } from "@/lib/db/views";

// who waits for whom. nodes sit on a circle; a lock held is a solid meta arrow (lock →
// holder), a wait is a dashed mute arrow (waiter → what it wants). only the edges that close
// a cycle are dead: that's the deadlock, and postgres breaks it by cancelling one of them
// (40P01). static, so it renders on the server.
//
//   <WaitForGraph nodes={[{ id: "T1" }, { id: "T2" }]} waits={[["T1", "T2"], ["T2", "T1"]]} cycle={[["T1", "T2"], ["T2", "T1"]]} />
//   <WaitForGraph nodes={[{ id: "T1" }, { id: "row 1", kind: "lock" }, ...]} holds={[["row 1", "T1"]]} waits={[["T2", "row 1"]]} />

export function describeWfg(v: WfgView): string {
  const cyc = v.cycle?.length ? `a cycle: ${v.cycle.map((e) => e[0]).join(" → ")} → ${v.cycle[0][0]}` : "no cycle";
  return `wait-for graph with ${v.nodes.length} nodes, ${v.waits.length} waits, ${cyc}`;
}

export function WaitForGraph(v: WfgView) {
  const id = useSvgId();
  const n = v.nodes.length;
  // each box as wide as its label and sub-label (mono: ~7.2 px a char at 12px, ~6 at 9.5px)
  const widthOf = (nd: WfgView["nodes"][number]) => Math.max(78, Math.ceil(Math.max(nd.id.length * 7.4, (nd.sub?.length ?? 0) * 6) + 18));
  const widest = Math.max(78, ...v.nodes.map(widthOf));
  // three boxes on a small circle crowd each other and their labels: give a triangle more room
  const R = n <= 2 ? Math.max(110, widest + 24) : Math.max(n === 3 ? 112 : Math.min(105, 60 + n * 8), widest * 0.75);
  const W = Math.max(360, Math.ceil(2 * R + widest + 16));
  const H = n <= 2 ? 170 : Math.max(260, Math.ceil(2 * R + 34 + 24));
  const cx = W / 2;
  const cy = H / 2;
  const pos = new Map(
    v.nodes.map((nd, i) => {
      const a = n <= 2 ? Math.PI * i : (i / n) * 2 * Math.PI - Math.PI / 2;
      return [nd.id, { x: cx + R * Math.cos(a), y: cy + (n <= 2 ? 0 : R * Math.sin(a)), nd }];
    }),
  );
  const inCycle = (a: string, b: string) => !!v.cycle?.some(([x, y]) => x === a && y === b);
  const box = { h: 34 };
  const wOf = new Map(v.nodes.map((nd) => [nd.id, widthOf(nd)]));
  // trim an edge so it starts and ends at the box borders; bend pairs that go both ways
  const edge = (a: string, b: string, bend: number) => {
    const p = pos.get(a)!;
    const q = pos.get(b)!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const cut = (u: number, w: number) => Math.min(Math.abs(w / 2 / (u || 1e-9)), Math.abs(box.h / 2 / (uy || 1e-9)));
    const s1 = cut(ux, wOf.get(a) ?? 78) + 3;
    const s2 = cut(ux, wOf.get(b) ?? 78) + 3;
    const x1 = p.x + ux * s1;
    const y1 = p.y + uy * s1;
    const x2 = q.x - ux * (s2 + 2);
    const y2 = q.y - uy * (s2 + 2);
    const mx = (x1 + x2) / 2 - uy * bend;
    const my = (y1 + y2) / 2 + ux * bend;
    // the label sits on the curve's midpoint, not on its control point (which, for a bent pair,
    // is twice as far out and can land on a box)
    return { d: `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`, mx: (x1 + 2 * mx + x2) / 4, my: (y1 + 2 * my + y2) / 4 };
  };
  const both = (a: string, b: string, list: [string, string][]) => list.some(([x, y]) => x === b && y === a);
  const all: [string, string][] = [...(v.holds ?? []), ...v.waits];
  return (
    <div className="@container grid min-w-0 gap-3 grid-cols-[minmax(0,1fr)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[520px]" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={describeWfg(v)}>
        <Heads id={id} tones={["meta", "mute", "dead"]} />
        {(v.holds ?? []).map(([lock, txn], i) => {
          const e = edge(lock, txn, both(lock, txn, all) ? 18 : 0);
          return (
            <g key={`h${i}`}>
              <path d={e.d} fill="none" stroke="var(--meta)" strokeWidth={1.4} markerEnd={`url(#${headId(id, "meta")})`} />
              <text x={e.mx} y={e.my + 3} textAnchor="middle" fontSize={9.5} fill="var(--meta)" stroke="var(--well)" strokeWidth={4} paintOrder="stroke">
                held by
              </text>
            </g>
          );
        })}
        {v.waits.map(([a, b], i) => {
          const c = inCycle(a, b);
          const e = edge(a, b, both(a, b, all) ? 22 : 0);
          return (
            <g key={`w${i}`}>
              <path d={e.d} fill="none" stroke={c ? "var(--dead)" : "var(--mute)"} strokeWidth={c ? 1.6 : 1.3} strokeDasharray="5 4" markerEnd={`url(#${headId(id, c ? "dead" : "mute")})`} />
              <text x={e.mx} y={e.my + 3} textAnchor="middle" fontSize={9.5} fill={c ? "var(--dead)" : "var(--mute)"} stroke="var(--well)" strokeWidth={4} paintOrder="stroke">
                waits for
              </text>
            </g>
          );
        })}
        {[...pos.values()].map(({ x, y, nd }) => (
          <g key={nd.id}>
            <rect
              x={x - (wOf.get(nd.id) ?? 78) / 2}
              y={y - box.h / 2}
              width={wOf.get(nd.id) ?? 78}
              height={box.h}
              rx={6}
              fill="var(--well)"
              stroke={nd.kind === "lock" ? "var(--meta)" : "var(--line-2)"}
              strokeWidth={1.2}
            />
            <text x={x} y={y + (nd.sub ? -1 : 4)} textAnchor="middle" fontSize={12} fill={nd.kind === "lock" ? "var(--meta)" : "var(--hi)"}>
              {nd.id}
            </text>
            {nd.sub && (
              <text x={x} y={y + 11} textAnchor="middle" fontSize={9.5} fill="var(--faint)">
                {nd.sub}
              </text>
            )}
          </g>
        ))}
      </svg>
      <Legend
        items={[
          ...(v.holds?.length ? ([["meta", "held by", "line"]] as const) : []),
          ["mute", "waits for", "dashed"],
          ...(v.cycle?.length ? ([["dead", "the cycle: a deadlock", "dashed"]] as const) : []),
        ].map((x) => [...x] as never)}
      />
    </div>
  );
}
