import { Heads, Legend, Provenance, headId, useSvgId } from "@/components/figures/kit";

// server side, static: the textbook picture of write skew. two transactions, two edges, each one
// "read something the other one then changed" (a read/write dependency). either serial order
// breaks one of the edges, so a cycle means no serial order explains what happened. drawn by hand;
// the run it describes is captured in the lanes above it.

export function RwCycle({ a = "T1 (asha)", b = "T2 (ben)", top = ["T1 read ben's row", "T2 changed it"], bottom = ["T2 read asha's row", "T1 changed it"] }: { a?: string; b?: string; top?: string[]; bottom?: string[] }) {
  const id = useSvgId();
  const W = 380;
  const H = 206;
  const box = { w: 108, h: 38 };
  const L = { x: 70, y: 106 };
  const R = { x: W - 70, y: 106 };
  return (
    <div className="@container grid min-w-0 gap-3 grid-cols-[minmax(0,1fr)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[520px]" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={`${a} and ${b} each read a row the other one changed: a cycle of read/write dependencies, so no serial order fits`}>
        <Heads id={id} tones={["dead"]} />
        <path d={`M${L.x + 20} ${L.y - box.h / 2 - 2} Q${W / 2} ${40} ${R.x - 20} ${R.y - box.h / 2 - 4}`} fill="none" stroke="var(--dead)" strokeWidth={1.5} strokeDasharray="5 4" markerEnd={`url(#${headId(id, "dead")})`} />
        <path d={`M${R.x - 20} ${R.y + box.h / 2 + 2} Q${W / 2} ${176} ${L.x + 20} ${L.y + box.h / 2 + 4}`} fill="none" stroke="var(--dead)" strokeWidth={1.5} strokeDasharray="5 4" markerEnd={`url(#${headId(id, "dead")})`} />
        {[top, bottom].map((lines, k) => (
          <text key={k} x={W / 2} y={k === 0 ? 30 : 178} textAnchor="middle" fontSize={10.5} fill="var(--dead)" stroke="var(--well)" strokeWidth={4} paintOrder="stroke">
            {lines.map((t, j) => (
              <tspan key={j} x={W / 2} dy={j === 0 ? 0 : 13}>
                {t}
              </tspan>
            ))}
          </text>
        ))}
        {[
          { p: L, t: a },
          { p: R, t: b },
        ].map(({ p, t }) => (
          <g key={t}>
            <rect x={p.x - box.w / 2} y={p.y - box.h / 2} width={box.w} height={box.h} rx={6} fill="var(--well)" stroke="var(--line-2)" strokeWidth={1.2} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fill="var(--hi)">
              {t}
            </text>
          </g>
        ))}
      </svg>
      <Legend items={[["dead", "read, then changed by the other: a cycle", "dashed"]]} />
      <Provenance drawn="the textbook picture of the capture above" />
    </div>
  );
}
