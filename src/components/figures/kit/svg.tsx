import { useId } from "react";
import { tv, type Ink } from "./tone";

// svg bits: arrowhead markers (one per ink, ids prefixed so figures never clash) and arrows.
// no "use client": useId works in server components too.

export function useSvgId(): string {
  return `s${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

export const headId = (id: string, k: Ink | "line-2" = "ref") => `${id}-h-${k}`;

/** arrowhead markers for the given inks. put once inside the svg's <defs> (or the svg). */
export function Heads({ id, tones = ["ref"] }: { id: string; tones?: (Ink | "line-2")[] }) {
  return (
    <defs>
      {tones.map((k) => (
        <marker key={k} id={headId(id, k)} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0.6 L7.4 4 L0 7.4 z" fill={k === "line-2" ? "var(--line-2)" : tv(k)} />
        </marker>
      ))}
    </defs>
  );
}

/** a path with an arrowhead. dashed = waiting / in progress; dim = context, not the point. */
export function Arrow({
  id,
  d,
  tone = "ref",
  dashed,
  dim,
  width = 1.25,
  className,
}: {
  id: string;
  d: string;
  tone?: Ink | "line-2";
  dashed?: boolean;
  dim?: boolean;
  width?: number;
  className?: string;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={tone === "line-2" ? "var(--line-2)" : tv(tone)}
      strokeWidth={width}
      strokeDasharray={dashed ? "4 3" : undefined}
      strokeLinecap="round"
      opacity={dim ? 0.35 : 1}
      markerEnd={`url(#${headId(id, tone)})`}
      className={className}
      style={{ transition: "opacity 200ms var(--ease)" }}
    />
  );
}

/** a cubic from (x1,y1) to (x2,y2) that leaves and arrives vertically. */
export const vcurve = (x1: number, y1: number, x2: number, y2: number, bend = 0.5) => {
  const dy = (y2 - y1) * bend;
  return `M${x1} ${y1} C${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
};

/** a cubic that leaves and arrives horizontally. */
export const hcurve = (x1: number, y1: number, x2: number, y2: number, bend = 0.5) => {
  const dx = (x2 - x1) * bend;
  return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

/** an arc that rises above a baseline between two x positions (for links along a strip). */
export const arcUp = (x1: number, x2: number, y: number, h: number) => `M${x1} ${y} C${x1} ${y - h}, ${x2} ${y - h}, ${x2} ${y}`;
