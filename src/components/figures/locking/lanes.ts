// pure helpers for part xv's figures: a pgtrace capture → the slim SessionLanes steps and lock
// lists a figure needs. copied from the transactions part's lanes.ts and extended: observer
// steps can stay in (with a short label), a wait with no heavyweight lock (a safe-snapshot
// wait) gets words instead of a crash, and lock lists can be narrowed by type, mode or object.
// no react, no "use client": mdx and server figures call these, and only their output ships.

import type { PgStep, PgTrace } from "@/lib/db/pgtrace";
import type { LockReq, SessionOp, SessionStep } from "@/lib/db/views";
import { outLine } from "@/lib/db/fromTrace";
import type { Ink } from "@/components/figures/kit/tone";

/** an imported .pgtrace.json (json imports type their literals loosely) */
export type Capture = PgTrace | Record<string, unknown>;
export const asTrace = (t: Capture) => t as unknown as PgTrace;

/** where a capture came from: just what <Provenance /> reads */
export const provOf = (t: Capture) => {
  const tr = asTrace(t);
  return { engine: { version: tr.engine?.version, build: (tr.engine as { build?: string })?.build }, scenario: tr.scenario };
};

/** the provenance object a SessionLanes run reads, without shipping the capture */
export const runTrace = (t: Capture) => provOf(t) as unknown as PgTrace;

/** step indices between observer steps that start a new round ("round two: ...") */
export function rounds(t: Capture): number[][] {
  const out: number[][] = [[]];
  asTrace(t).steps.forEach((s, i) => {
    if (s.session === "obs" && /round/i.test(s.note ?? "")) {
      if (out[out.length - 1].length) out.push([]);
    } else out[out.length - 1].push(i);
  });
  return out.filter((r) => r.length);
}

/** pg_locks' mode name the way people say it: "AccessExclusiveLock" → "ACCESS EXCLUSIVE" */
export function modeWords(m: string): string {
  if (m === "SIReadLock") return "SIRead";
  return m
    .replace(/Lock$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toUpperCase();
}

/** a lock's object in words a reader knows: "accounts", "row accounts (0,1)", "xid 759", "advisory 42" */
export function lockObj(l: { type: string; target: string }): string {
  if (l.type === "transactionid") return `xid ${l.target}`;
  if (l.type === "virtualxid") return `vxid ${l.target}`;
  if (l.type === "tuple") return `tuple ${l.target}`;
  if (l.type === "page") return l.target;
  if (l.type === "advisory") {
    const [hi, lo, sub] = l.target.split(":").map(Number);
    return sub === 2 ? `advisory (${hi}, ${lo})` : `advisory ${hi * 2 ** 32 + lo}`;
  }
  if (/^\d+$/.test(l.target)) return `relation ${l.target}`;
  return l.target;
}

const isVoid = (r?: PgStep["result"]) => !!r && r.columns.length === 1 && r.columns[0].type === "void";

function waitText(st: PgStep): string {
  const b = st.blocked;
  if (!b?.lock) return b?.by?.length ? `waits for ${b.by.join(", ")}` : "waits for a safe snapshot";
  const by = b.by.length ? `${b.by.join(", ")}: ` : "";
  return `waits for ${by}${b.lock.type === "relation" ? modeWords(b.lock.mode) : b.lock.mode} on ${lockObj(b.lock)}`;
}

export type LockFilter = {
  /** lock types to keep (relation, tuple, transactionid, virtualxid, advisory, page) */
  types?: string[];
  /** modes to keep (SIReadLock, ...) */
  modes?: string[];
  /** objects (relation names) to keep, for relation, page and tuple locks */
  objs?: string[];
};

export function locksOf(st: PgStep, f: LockFilter = {}): LockReq[] {
  return (st.locks ?? [])
    .filter((l) => !f.types || f.types.includes(l.type))
    .filter((l) => !f.modes || f.modes.includes(l.mode))
    .filter((l) => !f.objs || !["relation", "page", "tuple"].includes(l.type) || f.objs.some((o) => l.target === o || l.target.startsWith(`${o} `)))
    .map((l): LockReq => ({ txn: l.session, obj: lockObj(l), mode: l.type === "relation" || l.mode === "SIReadLock" ? modeWords(l.mode) : l.mode, granted: l.granted }));
}

export type LanesOpts = {
  /** only these step indices (default: every step; observer steps too, as their own row) */
  only?: number[];
  /** keep a lock list per step (for side="locks") */
  locks?: LockFilter;
  /** what to print for an observer step instead of its sql: step index → text */
  obs?: Record<number, string>;
  /** drop observer steps */
  noObs?: boolean;
  /** tint some ops: step index → tone */
  tones?: Record<number, Ink>;
  /** drop the snapshots from the lane headers */
  noSnaps?: boolean;
};

/** a capture as SessionLanes steps, trimmed to what the figure shows */
export function lanesOf(t: Capture, o: LanesOpts = {}): SessionStep[] {
  const tr = asTrace(t);
  const idx = (s: string) => tr.sessions.indexOf(s);
  const keep = o.only ?? tr.steps.map((_, i) => i).filter((i) => !(o.noObs && tr.steps[i].session === "obs"));
  return keep.map((i) => {
    const st = tr.steps[i];
    const ops: (SessionOp | null)[] = tr.sessions.map(() => null);
    const op: Exclude<SessionOp, string> = { sql: st.sql.trim() };
    if (st.status === "blocked") op.wait = waitText(st);
    else if (st.status === "error" && st.error) op.error = { sqlstate: st.error.sqlstate, message: st.error.message };
    else if (!isVoid(st.result)) op.out = outLine(st.result);
    if (o.tones?.[i]) op.tone = o.tones[i] as typeof op.tone;
    if (st.session !== "obs" && idx(st.session) >= 0) ops[idx(st.session)] = op;
    for (const w of st.woke ?? []) {
      if (idx(w.session) < 0) continue;
      const orig = tr.steps[w.step];
      const res = w.result;
      ops[idx(w.session)] = {
        sql: orig?.sql.trim() ?? "",
        woke: true,
        ...(w.error ? { error: { sqlstate: w.error.sqlstate, message: w.error.message } } : isVoid(res) ? {} : { out: outLine(res) }),
      };
    }
    const out: SessionStep = { ops, note: st.note };
    if (st.session === "obs") out.obs = { sql: o.obs?.[i] ?? st.sql.trim(), ...(st.result && !isVoid(st.result) && !o.obs?.[i] ? { out: outLine(st.result) } : {}) };
    if (!o.noSnaps && st.xids) {
      const snaps: NonNullable<SessionStep["snaps"]> = {};
      for (const [name, x] of Object.entries(st.xids)) snaps[name] = x.snap;
      out.snaps = snaps;
    }
    if (o.locks && st.locks) out.locks = locksOf(st, o.locks);
    return out;
  });
}

/**
 * the lock queue on one relation after every step, in the order the lock manager keeps it:
 * holders first, then waiters in the order they started waiting (the step that blocked). the
 * capture's lock list is sorted by session, so the arrival order comes from the steps.
 */
export function queueOf(t: Capture, rel: string, only?: number[]): LockReq[][] {
  const tr = asTrace(t);
  const keep = only ?? tr.steps.map((_, i) => i);
  const since: Record<string, number> = {};
  const out: LockReq[][] = [];
  tr.steps.forEach((st, i) => {
    if (st.status === "blocked" && st.blocked?.lock?.type === "relation" && st.blocked.lock.target === rel) since[st.session] = i;
    if (!keep.includes(i)) return;
    const mine = (st.locks ?? []).filter((l) => l.type === "relation" && l.target === rel);
    const held = mine.filter((l) => l.granted);
    const waiting = mine.filter((l) => !l.granted).sort((a, b) => (since[a.session] ?? 0) - (since[b.session] ?? 0));
    out.push([...held, ...waiting].map((l) => ({ txn: l.session, obj: rel, mode: modeWords(l.mode), granted: l.granted })));
  });
  return out;
}

/** every error in some steps, the ones a woken statement got included */
export function errorsIn(t: Capture, idx?: number[]): { session: string; sqlstate: string; message: string; detail?: string }[] {
  const tr = asTrace(t);
  const out: { session: string; sqlstate: string; message: string; detail?: string }[] = [];
  for (const i of idx ?? tr.steps.map((_, k) => k)) {
    const s = tr.steps[i];
    if (s.error) out.push({ session: s.session, ...s.error });
    for (const w of s.woke ?? []) if (w.error) out.push({ session: w.session, ...w.error });
  }
  return out;
}

/** psql's way of printing an error: ERROR, then DETAIL lines indented under it */
export function errorText(e: { message: string; detail?: string }): string {
  return `ERROR:  ${e.message}${e.detail ? `\nDETAIL:  ${e.detail.split("\n").join("\n         ")}` : ""}`;
}
