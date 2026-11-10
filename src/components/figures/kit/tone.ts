import type { CSSProperties } from "react";

// the five semantic colours, and the only helpers that turn them into css.
//   ref  = points at (ctid/TID, index → heap, child/sibling links, cursors)
//   live = visible / valid / the answer (COMMIT, matching rows, durable WAL, hits)
//   dead = garbage / bug (dead tuples, aborted versions, anomalies, errors, misestimates)
//   meta = machinery (headers, infomask bits, snapshots, locks held, clog, WAL headers)
//   hot  = look here (current step/row/operator, just appended, the clock hand, reads now)
// accent is for dirty pages and structure parity: a dirty page is not a bug.
// semantics.ts maps database states onto these; primitives never pick tones ad hoc.

export type Tone = "ref" | "live" | "dead" | "meta" | "hot";
export type Ink = Tone | "accent" | "mute" | "faint" | "ink" | "hi";
export const TONES: readonly Tone[] = ["ref", "live", "dead", "meta", "hot"];

/** the css colour of an ink. no ink = body text. */
export const tv = (k?: Ink | null): string => (k ? `var(--${k})` : "var(--ink)");

/** a soft fill: the colour mixed into transparent. 8-16% reads as a tint, not a block. */
export const tint = (k: Tone | "accent", pct = 12): string => `color-mix(in srgb, var(--${k}) ${pct}%, transparent)`;

/** an inset outline (box-shadow), so it never changes layout. */
export const ring = (k: Ink | "line" | "line-2" = "line-2", pct?: number, px = 1): string =>
  `inset 0 0 0 ${px}px ${pct ? `color-mix(in srgb, var(--${k}) ${pct}%, transparent)` : `var(--${k})`}`;

/** a dashed outline: waiting, in progress, unflushed, free, estimates. */
export const dashed = (k: Ink | "line-2" = "line-2"): CSSProperties => ({
  outline: `1px dashed ${k === "line-2" ? "var(--line-2)" : tv(k)}`,
  outlineOffset: -1,
});
