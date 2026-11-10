import { Provenance } from "@/components/figures/kit/Provenance";
import { tint } from "@/components/figures/kit/tone";
import { hashint4 } from "@/lib/db/sim/hash";

// the gist-and-spgist points: point(abs(hashint4(g)) % 100, abs(hashint4(-g)) % 100) for
// g = 1..n, recomputed here with the tested hashint4 port, so the dots are the table's rows.
// mode "gist": the leaf pages' bounding boxes, read from gist_page_items on the root (passed
// in, from the chapter's golden), overlapping where postgres let them. mode "quad": a
// quadtree drawn by a model over the same points (split a square at its centre until it holds
// at most `cap` points); SP-GiST has no pageinspect functions, so this one is not read from
// the index and says so. server only.

export type Box = { x1: number; y1: number; x2: number; y2: number };

const S = 3.2; // px per unit
const PAD = 10;
const W = 100 * S + PAD * 2;

export const tablePoints = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const g = i + 1;
    return { id: g, x: Math.abs(hashint4(g)) % 100, y: Math.abs(hashint4(-g)) % 100 };
  });

/** "(p)=(\"(37,42),(0,0)\")" → a box */
export function parseBox(keys: string): Box | null {
  const n = (keys.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (n.length < 4) return null;
  return { x1: Math.min(n[0], n[2]), y1: Math.min(n[1], n[3]), x2: Math.max(n[0], n[2]), y2: Math.max(n[1], n[3]) };
}

function quads(pts: { x: number; y: number }[], x: number, y: number, size: number, cap: number, depth = 0): Box[] {
  const inside = pts.filter((p) => p.x >= x && p.x < x + size && p.y >= y && p.y < y + size);
  if (inside.length <= cap || depth > 6) return [{ x1: x, y1: y, x2: x + size, y2: y + size }];
  const h = size / 2;
  return [
    ...quads(inside, x, y, h, cap, depth + 1),
    ...quads(inside, x + h, y, h, cap, depth + 1),
    ...quads(inside, x, y + h, h, cap, depth + 1),
    ...quads(inside, x + h, y + h, h, cap, depth + 1),
  ];
}

export function PointBoxes({
  n = 1000,
  mode = "gist",
  boxes = [],
  query,
  near = [],
  cap = 64,
  source,
}: {
  n?: number;
  mode?: "gist" | "quad";
  boxes?: Box[];
  query?: [number, number];
  near?: number[];
  cap?: number;
  /** the provenance line for gist mode */
  source?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const pts = tablePoints(n);
  const X = (v: number) => PAD + v * S;
  const Y = (v: number) => PAD + (99 - v) * S; // y up
  const shown = mode === "quad" ? quads(pts, 0, 0, 100, cap) : boxes;
  const nearSet = new Set(near);
  return (
    <div className="grid min-w-0 gap-2 text-12">
      <svg
        viewBox={`0 0 ${W} ${W}`}
        className="mx-auto block h-auto w-full max-w-[360px]"
        style={{ fontFamily: "var(--font-code)" }}
        role="img"
        aria-label={
          mode === "gist"
            ? `${n} points and the ${boxes.length} bounding boxes of the gist index's leaf pages`
            : `${n} points in a quadtree model: ${shown.length} squares, each split at its centre until it holds at most ${cap} points`
        }
      >
        <rect x={PAD} y={PAD} width={99 * S} height={99 * S} fill="none" stroke="var(--line-2)" />
        {pts.map((p) => (
          <circle key={p.id} cx={X(p.x)} cy={Y(p.y)} r={nearSet.has(p.id) ? 3 : 1.3} fill={nearSet.has(p.id) ? "var(--hot)" : "var(--mute)"} opacity={nearSet.has(p.id) ? 1 : 0.7} />
        ))}
        {shown.map((b, i) => (
          <rect
            key={i}
            x={X(b.x1)}
            y={Y(Math.min(99, b.y2))}
            width={Math.max(1, (Math.min(99, b.x2) - b.x1) * S)}
            height={Math.max(1, (Math.min(99, b.y2) - b.y1) * S)}
            fill={mode === "gist" ? tint("ref", 7) : "none"}
            stroke="var(--ref)"
            strokeWidth={mode === "gist" ? 1.2 : 0.8}
            strokeDasharray={mode === "quad" ? "3 2" : undefined}
          />
        ))}
        {mode === "gist" &&
          shown.map((b, i) => (
            <text key={`t${i}`} x={X(b.x1) + 3} y={Y(Math.min(99, b.y2)) + 11} fontSize={10} fill="var(--ref)">
              {i + 1}
            </text>
          ))}
        {query && (
          <g>
            <line x1={X(query[0]) - 6} x2={X(query[0]) + 6} y1={Y(query[1])} y2={Y(query[1])} stroke="var(--hot)" strokeWidth={1.5} />
            <line x1={X(query[0])} x2={X(query[0])} y1={Y(query[1]) - 6} y2={Y(query[1]) + 6} stroke="var(--hot)" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {mode === "gist" && source ? <Provenance trace={source} /> : null}
      {mode === "quad" ? <Provenance sim={`model of a point quadtree over the same ${n.toLocaleString("en-US")} rows, not read from the index`} /> : null}
    </div>
  );
}
