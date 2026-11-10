"use client";

import { Fragment } from "react";
import { Legend, Provenance, tint, tv, useWidth, type Ink, type LegendItem } from "@/components/figures/kit";

// an entity-relationship diagram in crow's foot notation: one box per table (its name, its
// columns, pk and fk marked), and a line per foreign key that ends in the cardinality marks.
// lines are ref (a foreign key points at a key). positions are given for the wide layout; on a
// phone the boxes stack in a single column (in the order given) and links bow out to the right,
// because a wide diagram scaled down to a phone is unreadable. no data from postgres:
// the shape comes from the CREATE TABLEs in the chapter, so it says "drawn by hand".

export type ErCol = { name: string; type?: string; pk?: boolean; fk?: boolean; tone?: Ink };
export type ErEntity = {
  name: string;
  cols: ErCol[];
  /** top-left corner in the wide layout (viewBox units) */
  at: [number, number];
  tone?: Ink;
  dashed?: boolean;
  note?: string;
};
/** min and max of one end: |  one, o zero; many = the crow's foot */
export type ErEnd = "one" | "zero-one" | "many" | "zero-many";
export type ErLink = { from: string; fromCol: string; to: string; toCol?: string; fromEnd: ErEnd; toEnd: ErEnd; tone?: Ink; dashed?: boolean; label?: string };

const BW = 172;
const HEAD = 26;
const ROW = 19;

function rowY(e: ErEntity, at: [number, number], col?: string) {
  const i = col ? e.cols.findIndex((c) => c.name === col) : e.cols.findIndex((c) => c.pk);
  return at[1] + HEAD + (Math.max(0, i) + 0.5) * ROW;
}

/** the marks at one end of a line. p is where the line meets the box, d the outward direction (±1 on x) */
function EndMarks({ x, y, d, end, color }: { x: number; y: number; d: 1 | -1; end: ErEnd; color: string }) {
  const many = end === "many" || end === "zero-many";
  const zero = end.startsWith("zero");
  const parts: string[] = [];
  if (many) {
    // the foot: three toes spread on the box, meeting 12 units out
    parts.push(`M${x + d * 12} ${y} L${x} ${y - 6}`, `M${x + d * 12} ${y} L${x} ${y + 6}`, `M${x + d * 12} ${y} L${x} ${y}`);
  } else {
    parts.push(`M${x + d * 7} ${y - 6} L${x + d * 7} ${y + 6}`);
  }
  if (!zero) parts.push(`M${x + d * 16} ${y - 6} L${x + d * 16} ${y + 6}`);
  return (
    <g stroke={color} strokeWidth={1.25} fill="none">
      {parts.map((p, i) => (
        <path key={i} d={p} />
      ))}
      {zero && <circle cx={x + d * 20} cy={y} r={4} fill="var(--well)" />}
    </g>
  );
}

export function ErDiagram({
  entities,
  links,
  width = 720,
  height,
  narrowWidth = 300,
  legend,
  label = "an entity-relationship diagram",
  provenance = "from the CREATE TABLEs below",
}: {
  entities: ErEntity[];
  links: ErLink[];
  width?: number;
  height: number;
  narrowWidth?: number;
  legend?: LegendItem[];
  label?: string;
  provenance?: string;
}) {
  const [ref, w] = useWidth(720);
  const narrow = w < 560;
  const stacked = new Map<string, [number, number]>();
  let sy = 4;
  for (const e of entities) {
    stacked.set(e.name, [8, sy]);
    sy += HEAD + e.cols.length * ROW + 4 + 30;
  }
  const W = narrow ? narrowWidth : width;
  const H = narrow ? sy - 26 : height;
  const pos = (e: ErEntity): [number, number] => (narrow ? stacked.get(e.name)! : e.at);
  const by = new Map(entities.map((e) => [e.name, e]));

  return (
    <div ref={ref} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full" style={{ maxWidth: W * 1.15 }} role="img" aria-label={label}>
        {links.map((l, i) => {
          const a = by.get(l.from);
          const b = by.get(l.to);
          if (!a || !b) return null;
          const pa = pos(a);
          const pb = pos(b);
          const ya = rowY(a, pa, l.fromCol);
          const yb = rowY(b, pb, l.toCol);
          const color = tv(l.tone ?? "ref");
          let xa: number, xb: number, da: 1 | -1, db: 1 | -1, d: string;
          if (pb[0] >= pa[0] + BW) {
            xa = pa[0] + BW; xb = pb[0]; da = 1; db = -1;
            const m = (xb - xa) / 2;
            d = `M${xa} ${ya} C${xa + m} ${ya}, ${xb - m} ${yb}, ${xb} ${yb}`;
          } else if (pb[0] + BW <= pa[0]) {
            xa = pa[0]; xb = pb[0] + BW; da = -1; db = 1;
            const m = (xa - xb) / 2;
            d = `M${xa} ${ya} C${xa - m} ${ya}, ${xb + m} ${yb}, ${xb} ${yb}`;
          } else {
            // stacked: leave and arrive on the right, bowing out
            xa = pa[0] + BW; xb = pb[0] + BW; da = 1; db = 1;
            const bow = 46 + Math.abs(yb - ya) * 0.06;
            d = `M${xa} ${ya} C${xa + bow} ${ya}, ${xb + bow} ${yb}, ${xb} ${yb}`;
          }
          const mx = (xa + xb) / 2 + (da === db ? 40 : 0);
          const my = (ya + yb) / 2;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeDasharray={l.dashed ? "4 3" : undefined} />
              <EndMarks x={xa} y={ya} d={da} end={l.fromEnd} color={color} />
              <EndMarks x={xb} y={yb} d={db} end={l.toEnd} color={color} />
              {l.label && (
                <text x={mx} y={my - 6} textAnchor="middle" fontSize={10.5} fill="var(--mute)" fontStyle="italic">
                  {l.label}
                </text>
              )}
            </g>
          );
        })}
        {entities.map((e) => {
          const [x, y] = pos(e);
          const h = HEAD + e.cols.length * ROW + 4;
          const k = e.tone;
          return (
            <g key={e.name}>
              <rect
                x={x}
                y={y}
                width={BW}
                height={h}
                rx={6}
                fill={k && k !== "ink" ? tint(k as "ref", 7) : "var(--bg)"}
                stroke={k ? tv(k) : "var(--line-2)"}
                strokeDasharray={e.dashed ? "4 3" : undefined}
              />
              <line x1={x} x2={x + BW} y1={y + HEAD} y2={y + HEAD} stroke="var(--line-2)" />
              <text x={x + 10} y={y + 17} fontSize={12.5} fill="var(--hi)">
                {e.name}
              </text>
              {e.note && (
                <text x={x + BW - 8} y={y + 17} fontSize={10} fill="var(--faint)" textAnchor="end" fontStyle="italic">
                  {e.note}
                </text>
              )}
              {e.cols.map((c, j) => {
                const cy = y + HEAD + j * ROW + 13.5;
                return (
                  <Fragment key={c.name}>
                    <text x={x + 10} y={cy} fontSize={11.5} fill={c.tone ? tv(c.tone) : c.fk ? "var(--ref)" : "var(--ink)"} textDecoration={c.pk ? "underline" : undefined}>
                      {c.name}
                    </text>
                    <text x={x + BW - 8} y={cy} fontSize={10} fill="var(--faint)" textAnchor="end">
                      {[c.pk ? "pk" : "", c.fk ? "fk" : ""].filter(Boolean).join(" ") || c.type || ""}
                    </text>
                  </Fragment>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Legend items={legend ?? [["ref", "foreign key → the key it points at", "line"]]} />
        <Provenance drawn={provenance} />
      </div>
    </div>
  );
}
