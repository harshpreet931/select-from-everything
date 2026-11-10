import { Heads, Legend, Provenance, headId, useSvgId } from "@/components/figures/kit";

// server side, static: the textbook dangerous structure from Cahill, Röhm and Fekete (2008),
// as postgres's SSI checks for it (Ports and Grittner, 2012): two rw-antidependencies in a row,
// T_in → T_pivot → T_out, between overlapping transactions, with T_out committing first.
// an rw edge A → B means "A read a version that B's write replaced" (A must come before B).
// drawn by hand; the capture in the chapter shows the real thing.

export function DangerousStructure({ labels = ["T_in", "T_pivot", "T_out"], cycle }: { labels?: string[]; cycle?: boolean }) {
  const id = useSvgId();
  const W = 460;
  const H = cycle ? 230 : 130;
  const xs = [70, 230, 390];
  const y = 80;
  const bw = 96;
  const bh = 36;
  return (
    <div className="grid min-w-0 gap-3 grid-cols-[minmax(0,1fr)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[520px]" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={`${labels[0]} has an rw-antidependency to ${labels[1]}, which has one to ${labels[2]}${cycle ? `; here ${labels[2]} and ${labels[0]} are the same transaction, so it's a cycle` : ""}`}>
        <Heads id={id} tones={["dead", "mute"]} />
        {[0, 1].map((k) => (
          <g key={k}>
            <path d={`M${xs[k] + bw / 2 + 4} ${y} L${xs[k + 1] - bw / 2 - 8} ${y}`} stroke="var(--dead)" strokeWidth={1.6} strokeDasharray="5 4" markerEnd={`url(#${headId(id, "dead")})`} />
            <text x={(xs[k] + xs[k + 1]) / 2} y={y - 10} textAnchor="middle" fontSize={10.5} fill="var(--dead)">
              rw
            </text>
            <text x={(xs[k] + xs[k + 1]) / 2} y={y + 20} textAnchor="middle" fontSize={9} fill="var(--mute)">
              read, then
            </text>
            <text x={(xs[k] + xs[k + 1]) / 2} y={y + 31} textAnchor="middle" fontSize={9} fill="var(--mute)">
              overwritten
            </text>
          </g>
        ))}
        {cycle && (
          <path d={`M${xs[2]} ${y + bh / 2 + 4} Q${xs[1]} ${y + 150} ${xs[0]} ${y + bh / 2 + 6}`} fill="none" stroke="var(--mute)" strokeWidth={1.2} strokeDasharray="2 3" markerEnd={`url(#${headId(id, "mute")})`} />
        )}
        {cycle && (
          <text x={xs[1]} y={y + 118} textAnchor="middle" fontSize={9.5} fill="var(--mute)" stroke="var(--well)" strokeWidth={4} paintOrder="stroke">
            same transaction: the edges close a cycle
          </text>
        )}
        {labels.map((l, k) => (
          <g key={l}>
            <rect x={xs[k] - bw / 2} y={y - bh / 2} width={bw} height={bh} rx={6} fill="var(--well)" stroke={k === 1 ? "var(--hot)" : "var(--line-2)"} strokeWidth={1.2} />
            <text x={xs[k]} y={y + 4} textAnchor="middle" fontSize={12} fill={k === 1 ? "var(--hot)" : "var(--hi)"}>
              {l}
            </text>
          </g>
        ))}
        {!cycle && (
          <text x={xs[2]} y={y - 30} textAnchor="middle" fontSize={9.5} fill="var(--live)">
            commits first
          </text>
        )}
      </svg>
      <Legend
        items={[
          ["dead", "rw-antidependency: the reader must come before the writer", "dashed"],
          ["hot", "the pivot: an edge in and an edge out"],
        ]}
      />
      <Provenance drawn="the textbook structure (Cahill et al. 2008)" />
    </div>
  );
}
