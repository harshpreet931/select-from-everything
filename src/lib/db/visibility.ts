// model of HeapTupleSatisfiesMVCC (src/backend/access/heap/heapam_visibility.c), simplified:
// no command ids (a transaction sees all of its own earlier writes), no multixacts beyond
// "lock only", subtransactions only through `mine`. checked against real postgres 18.6 in
// sim/visibility.test.ts: the predicted visible ctids equal the rows a real session reads.
//
// the test, in the order postgres runs it:
//   1. xmin aborted                         → invisible (the insert never happened)
//   2. xmin is mine                         → visible, unless I deleted it myself
//   3. xmin not done at snapshot time       → invisible (in xip: still running; >= xmax: not started yet)
//   4. no xmax, or xmax only locked the row → visible
//   5. xmax is mine                         → invisible (I deleted it)
//   6. xmax aborted                         → visible (the delete never happened)
//   7. xmax not done at snapshot time       → visible (the delete hasn't happened yet for me)
//   8. otherwise                            → invisible (deleted before my snapshot)

import type { Snap, Tuple, XactStatus, Xid } from "./views";

export const HEAP_XMAX_LOCK_ONLY = 0x0080;
export const HEAP_XMIN_COMMITTED = 0x0100;
export const HEAP_XMIN_INVALID = 0x0200;
export const HEAP_XMAX_COMMITTED = 0x0400;
export const HEAP_XMAX_INVALID = 0x0800;
export const HEAP_XMAX_IS_MULTI = 0x1000;
export const HEAP_HOT_UPDATED = 0x4000; // infomask2
export const HEAP_ONLY_TUPLE = 0x8000; // infomask2

export type Reader = {
  snap: Snap;
  /** the reader's own xid (and subxids), whose writes it always sees */
  me?: Xid | null;
  mine?: Xid[];
};

export type Verdict = { visible: boolean; rule: number; why: string };

/** why an xid's work doesn't count for a snapshot. at or past xmax it hadn't even started */
function notDone(field: "xmin" | "xmax", x: Xid, s: Snap): string {
  if (x >= s.xmax) return `${field} ${x} ≥ the snapshot's xmax ${s.xmax}: that transaction hadn't started when the snapshot was taken`;
  if (s.xip.includes(x)) return `${field} ${x} is in the snapshot's xip list: that transaction was still running when the snapshot was taken`;
  return `${field} ${x} hadn't committed`;
}

/** is xid's work invisible to the snapshot because it hadn't finished? (in xip: still running; >= xmax: not started yet) */
export const runningAt = (xid: Xid, s: Snap): boolean => xid >= s.xmax || s.xip.includes(xid);

const isMine = (x: Xid | undefined, r: Reader) => x != null && x !== 0 && (x === r.me || !!r.mine?.includes(x));

export function visible(t: Pick<Tuple, "xmin" | "xmax" | "infomask" | "lpFlags">, xact: Record<number, XactStatus>, r: Reader): Verdict {
  if (t.lpFlags !== "normal" || t.xmin == null) return { visible: false, rule: 0, why: "no tuple here (the line pointer is not normal)" };
  const xmin = t.xmin;
  const xmax = t.xmax ?? 0;
  const im = t.infomask ?? 0;
  // clog first; hint bits stand in when the caller didn't list the xid
  const st = (x: Xid, hint: number): XactStatus | undefined => (x <= 2 ? "committed" : (xact[x] ?? (im & hint ? "committed" : undefined)));

  if (st(xmin, HEAP_XMIN_COMMITTED) === "aborted" || (im & HEAP_XMIN_INVALID && !(im & HEAP_XMIN_COMMITTED))) return { visible: false, rule: 1, why: `xmin ${xmin} aborted: this version was never inserted.` };
  if (isMine(xmin, r)) {
    if (xmax && !(im & HEAP_XMAX_LOCK_ONLY) && isMine(xmax, r)) return { visible: false, rule: 2, why: `my own insert (xmin ${xmin}), but I also deleted it (xmax ${xmax}).` };
    return { visible: true, rule: 2, why: `my own insert (xmin ${xmin}): a transaction sees its own writes.` };
  }
  if (runningAt(xmin, r.snap) || st(xmin, HEAP_XMIN_COMMITTED) !== "committed")
    return { visible: false, rule: 3, why: `${notDone("xmin", xmin, r.snap)}: the insert doesn't exist for this reader.` };

  if (!xmax) return { visible: true, rule: 4, why: `xmin ${xmin} committed before the snapshot, and nobody deleted it.` };
  if (im & HEAP_XMAX_INVALID) return { visible: true, rule: 6, why: `xmax ${xmax} is marked invalid (it aborted, or only locked the row), so the row stands.` };
  if (im & HEAP_XMAX_LOCK_ONLY) return { visible: true, rule: 4, why: `xmin ${xmin} committed; xmax ${xmax} only locked the row, it didn't delete it.` };
  if (isMine(xmax, r)) return { visible: false, rule: 5, why: `I deleted or updated it myself (xmax ${xmax}).` };
  if (st(xmax, HEAP_XMAX_COMMITTED) === "aborted") return { visible: true, rule: 6, why: `xmax ${xmax} aborted, so the delete never happened.` };
  if (runningAt(xmax, r.snap) || st(xmax, HEAP_XMAX_COMMITTED) !== "committed")
    return { visible: true, rule: 7, why: `${notDone("xmax", xmax, r.snap)}, so for this reader the row isn't deleted or replaced yet.` };
  return { visible: false, rule: 8, why: `xmax ${xmax} committed before the snapshot: deleted or updated, from this reader's point of view.` };
}

/** dead to everyone: deleted by a committed xid older than every snapshot (the horizon), or never inserted */
export function removable(t: Pick<Tuple, "xmin" | "xmax" | "infomask" | "lpFlags">, xact: Record<number, XactStatus>, horizon?: Xid): boolean {
  if (t.lpFlags === "dead") return true;
  if (t.lpFlags !== "normal" || t.xmin == null) return false;
  const im = t.infomask ?? 0;
  if (xact[t.xmin] === "aborted" || (im & HEAP_XMIN_INVALID && !(im & HEAP_XMIN_COMMITTED))) return true;
  const xmax = t.xmax ?? 0;
  if (!xmax || im & HEAP_XMAX_INVALID || im & HEAP_XMAX_LOCK_ONLY) return false;
  if ((xact[xmax] ?? (im & HEAP_XMAX_COMMITTED ? "committed" : undefined)) !== "committed") return false;
  return horizon == null ? false : xmax < horizon;
}

/** a reader that started now, after everything listed in xact finished (or is still running) */
export function freshReader(xact: Record<number, XactStatus>): Reader {
  const xs = Object.keys(xact).map(Number);
  const xmax = (xs.length ? Math.max(...xs) : 0) + 1;
  const xip = xs.filter((x) => xact[x] === "in progress");
  return { snap: { xmin: xip.length ? Math.min(...xip) : xmax, xmax, xip } };
}

/** "754:756:754" → Snap */
export function parseSnap(s: string): Snap {
  const [a, b, c] = s.split(":");
  return { xmin: Number(a), xmax: Number(b), xip: c ? c.split(",").filter(Boolean).map(Number) : [] };
}

export const snapText = (s: Snap) => `${s.xmin}:${s.xmax}:${s.xip.join(",")}`;
