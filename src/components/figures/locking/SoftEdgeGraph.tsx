import { Heads, Legend, Provenance, headId, useSvgId } from "@/components/figures/kit";
import { asTrace, lockObj, modeWords, provOf, type Capture } from "./lanes";

// server side, static: the wait-for graph of a capture at one step, with each edge marked hard
// or soft. an edge waiter → blocker is hard when the blocker holds a granted lock on the object
// the waiter wants (pg_locks at that step), soft when the blocker is only queued ahead of it.
// the deadlock detector can break a cycle that contains a soft edge by reordering the queue.

export function SoftEdgeGraph({ trace, at }: { trace: Capture; at: number }) {
  const tr = asTrace(trace);
  const id = useSvgId();
  const locks = tr.steps[at].locks ?? [];
  const edges = tr.steps
    .slice(0, at + 1)
    .filter((s) => s.status === "blocked" && s.blocked?.lock)
    .map((s) => {
      const l = s.blocked!.lock;
      const by = s.blocked!.by[0];
      const hard = locks.some((x) => x.session === by && x.granted && x.type === l.type && x.target === l.target);
      return { from: s.session, to: by, hard, label: `${l.type === "relation" ? modeWords(l.mode) : l.mode.replace(/Lock$/, "")} on ${lockObj(l)}` };
    });
  const names = tr.sessions;
  const W = 460;
  const H = 300;
  const R = 105;
  const pos = Object.fromEntries(names.map((n, i) => [n, { x: W / 2 + R * 1.25 * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / names.length), y: 150 + R * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / names.length) }]));
  const bw = 64;
  const bh = 32;
  return (
    <div className="grid min-w-0 gap-3 grid-cols-[minmax(0,1fr)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[520px]" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={`wait-for graph: ${edges.map((e) => `${e.from} waits for ${e.to} (${e.hard ? "hard" : "soft"})`).join(", ")}`}>
        <Heads id={id} tones={["dead", "hot"]} />
        {edges.map((e, i) => {
          const p = pos[e.from];
          const q = pos[e.to];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const len = Math.hypot(dx, dy);
          const ux = dx / len;
          const uy = dy / len;
          const cut = Math.min(Math.abs(bw / 2 / (ux || 1e-9)), Math.abs(bh / 2 / (uy || 1e-9))) + 4;
          const x1 = p.x + ux * cut;
          const y1 = p.y + uy * cut;
          const x2 = q.x - ux * (cut + 2);
          const y2 = q.y - uy * (cut + 2);
          const mx = (x1 + x2) / 2 - uy * 26;
          const my = (y1 + y2) / 2 + ux * 26;
          const tone = e.hard ? "dead" : "hot";
          return (
            <g key={i}>
              <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke={`var(--${tone})`} strokeWidth={1.6} strokeDasharray={e.hard ? "5 4" : "2 3"} markerEnd={`url(#${headId(id, tone)})`} />
              <text x={mx} y={my - 4} textAnchor="middle" fontSize={10} fill={`var(--${tone})`} stroke="var(--well)" strokeWidth={4} paintOrder="stroke">
                {e.hard ? "hard" : "soft"}
              </text>
              <text x={mx} y={my + 9} textAnchor="middle" fontSize={9} fill="var(--mute)" stroke="var(--well)" strokeWidth={4} paintOrder="stroke">
                {e.label}
              </text>
            </g>
          );
        })}
        {names.map((n) => (
          <g key={n}>
            <rect x={pos[n].x - bw / 2} y={pos[n].y - bh / 2} width={bw} height={bh} rx={6} fill="var(--well)" stroke="var(--line-2)" strokeWidth={1.2} />
            <text x={pos[n].x} y={pos[n].y + 4} textAnchor="middle" fontSize={12} fill="var(--hi)">
              {n}
            </text>
          </g>
        ))}
      </svg>
      <Legend
        items={[
          ["dead", "hard: waits for a lock the other one holds", "dashed"],
          ["hot", "soft: the other one is only queued ahead", "dashed"],
        ]}
      />
      <Provenance trace={provOf(trace)} />
    </div>
  );
}
