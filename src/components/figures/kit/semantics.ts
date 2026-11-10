import type { XactStatus } from "@/lib/db/views";
import type { Ink } from "./tone";

// the site-wide colour map for database states, in code. a primitive asks look(state)
// and draws what comes back. three rules carry most of it:
//   commit status = outline: committed solid, in progress dashed, aborted dead
//   visibility to the chosen snapshot = tint: live if visible
//   removable = dead ghost
// never dead for: dirty, waiting, in progress, eviction, a seq scan as such, or a user's
// ROLLBACK statement (only the versions it leaves behind). never colour-code sessions,
// rmgrs or plan node types. figure captions use <C k> with the same words as the Legend.

export type Look = { tone: Ink; dashed?: boolean; ghost?: boolean; strike?: boolean; badge?: string };

export const LOOK = {
  // versions and tuples
  visible: { tone: "live" },
  invisible: { tone: "mute" },
  committed: { tone: "ink" },
  "in progress": { tone: "mute", dashed: true },
  aborted: { tone: "dead", badge: "aborted" },
  removable: { tone: "dead", ghost: true, dashed: true, badge: "dead" },
  "lp dead": { tone: "dead", ghost: true, badge: "dead" },
  redirect: { tone: "ref", badge: "redirect" },
  unused: { tone: "faint", dashed: true },
  free: { tone: "faint", dashed: true },
  "heap only": { tone: "ink", badge: "H" },
  // pages and buffers
  header: { tone: "meta" },
  special: { tone: "meta" },
  "line pointer": { tone: "ref" },
  dirty: { tone: "accent", badge: "dirty" },
  hit: { tone: "live" },
  read: { tone: "hot" },
  hand: { tone: "hot" },
  evicting: { tone: "hot" },
  empty: { tone: "faint", dashed: true },
  pinned: { tone: "meta", badge: "pin" },
  // locks and sessions
  held: { tone: "meta" },
  waiting: { tone: "mute", dashed: true },
  commit: { tone: "live" },
  error: { tone: "dead" },
  current: { tone: "hot" },
  future: { tone: "faint", ghost: true },
  snapshot: { tone: "meta" },
  anomaly: { tone: "dead" },
  prevented: { tone: "live" },
  "cycle edge": { tone: "dead" },
  // b-trees and hash
  "high key": { tone: "meta" },
  "child link": { tone: "ref" },
  "search path": { tone: "hot" },
  "meta page": { tone: "meta" },
  overflow: { tone: "faint", dashed: true },
  // WAL
  durable: { tone: "live" },
  unflushed: { tone: "mute", dashed: true, badge: "in wal_buffers" },
  "just appended": { tone: "hot" },
  "redo pointer": { tone: "meta" },
  lost: { tone: "dead", strike: true, badge: "lost" },
  applied: { tone: "hot" },
  skipped: { tone: "mute" },
  // plans
  estimate: { tone: "mute", dashed: true },
  actual: { tone: "hi" },
  misestimate: { tone: "dead" },
  // results
  match: { tone: "live" },
  dropped: { tone: "faint", ghost: true, strike: true },
} satisfies Record<string, Look>;

export type DbState = keyof typeof LOOK;

export const look = (s: DbState): Look => LOOK[s];

/** outline for a transaction status: committed solid, in progress dashed, aborted dead. */
export const statusLook = (s: XactStatus | undefined): Look => (s === "aborted" ? LOOK.aborted : s === "in progress" ? LOOK["in progress"] : LOOK.committed);
