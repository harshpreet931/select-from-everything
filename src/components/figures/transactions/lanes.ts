// pure helpers for part xi's figures: a pgtrace capture → the slim SessionLanes steps a client
// figure needs (ops, notes, snapshots, and only the locks or committed rows a figure asks for).
// no react, no "use client": mdx and server figures call these, and only their output ships.

import type { PgStep, PgTrace } from "@/lib/db/pgtrace";
import type { LockReq, SessionOp, SessionStep, Table } from "@/lib/db/views";
import { traceLanes } from "@/lib/db/fromTrace";
import type { Ink } from "@/components/figures/kit/tone";

/** an imported .pgtrace.json (json imports type their literals loosely) */
export type Capture = PgTrace | Record<string, unknown>;
export const asTrace = (t: Capture) => t as unknown as PgTrace;

/** where a capture came from: just what <Provenance /> reads */
export const provOf = (t: Capture) => {
  const tr = asTrace(t);
  return { engine: { version: tr.engine?.version, build: (tr.engine as { build?: string })?.build }, scenario: tr.scenario };
};

/** a run of steps between observer steps: one isolation level of an anomaly capture, say */
export function rounds(t: Capture): number[][] {
  const out: number[][] = [[]];
  asTrace(t).steps.forEach((s, i) => {
    if (s.session === "obs") {
      if (out[out.length - 1].length) out.push([]);
    } else out[out.length - 1].push(i);
  });
  return out.filter((r) => r.length);
}

/** the isolation level a round asks for, from its first BEGIN ISOLATION LEVEL */
export function levelOf(t: Capture, idx: number[]): string {
  for (const i of idx) {
    const m = /ISOLATION LEVEL\s+(READ UNCOMMITTED|READ COMMITTED|REPEATABLE READ|SERIALIZABLE)/i.exec(asTrace(t).steps[i].sql);
    if (m) return m[1].toLowerCase();
  }
  return "read committed";
}

const isVoid = (r?: PgStep["result"]) => !!r && r.columns.length === 1 && r.columns[0].type === "void";

/** the one value a step returned (one row, one column), or undefined */
export function valueAt(t: Capture, i: number): string | undefined {
  const r = asTrace(t).steps[i]?.result;
  return r && r.data.length === 1 && r.columns.length === 1 ? (r.data[0][0] ?? undefined) : undefined;
}

/** every error in some steps, the ones a woken statement got included */
export function errorsIn(t: Capture, idx: number[]): { session: string; sqlstate: string; message: string; detail?: string }[] {
  const tr = asTrace(t);
  const out: { session: string; sqlstate: string; message: string; detail?: string }[] = [];
  for (const i of idx) {
    const s = tr.steps[i];
    if (s.error) out.push({ session: s.session, ...s.error });
    for (const w of s.woke ?? []) if (w.error) out.push({ session: w.session, ...w.error });
  }
  return out;
}

/** a lock in words a reader knows: "advisory 42", "row accounts (0,2)", "xid 759" */
function lockObj(l: { type: string; target: string }): string {
  if (l.type === "transactionid") return `xid ${l.target}`;
  if (l.type === "tuple") return `row ${l.target}`;
  if (l.type === "advisory") {
    const [hi, lo, sub] = l.target.split(":").map(Number);
    return sub === 2 ? `advisory (${hi}, ${lo})` : `advisory ${hi * 2 ** 32 + lo}`;
  }
  return l.target;
}

export type LanesOpts = {
  /** only these step indices (default: every step but the observer's) */
  only?: number[];
  /** keep the lock list for side="locks": these lock types (default: none) */
  locks?: string[];
  /** keep the committed table for side="db" */
  db?: boolean;
  /** turn the committed table into one value column: cells={[label]} */
  cell?: { label: string; key: [string, string]; col: string };
  /** turn the committed table into a smaller one: these columns, in this order */
  cols?: string[];
  /** tint some ops: step index → tone */
  tones?: Record<number, Ink>;
  /** what to write in each lane on a @crash / @restart step */
  server?: Record<string, { crash?: string; restart?: string }>;
  /** drop the snapshots from the lane headers */
  noSnaps?: boolean;
};

/** a capture as SessionLanes steps, trimmed to what the figure shows */
export function lanesOf(t: Capture, o: LanesOpts = {}): SessionStep[] {
  const tr = asTrace(t);
  const all = traceLanes(tr);
  const keep = o.only ?? tr.steps.map((_, i) => i).filter((i) => tr.steps[i].session !== "obs");
  return keep.map((i) => {
    const st = tr.steps[i];
    const src = all[i];
    const ops = (src.ops ?? []).map((op, si) => {
      if (!op || typeof op === "string") return op;
      const name = tr.sessions[si];
      const fixed: Exclude<SessionOp, string> = { ...op };
      // a void function (pg_advisory_lock) prints an empty cell; say nothing instead of "→ "
      const res = fixed.woke ? st.woke?.find((w) => w.session === name)?.result : st.session === name ? st.result : undefined;
      if (isVoid(res)) delete fixed.out;
      // an advisory wait reads "advisory 42", not pg_locks' "0:42:1"
      if (fixed.wait && st.session === name && st.blocked?.lock.type === "advisory") fixed.wait = `waits for ${st.blocked.by.join(", ")}: ${st.blocked.lock.mode} on ${lockObj(st.blocked.lock)}`;
      if (o.tones?.[i] && st.session === name && !fixed.woke) fixed.tone = o.tones[i] as typeof fixed.tone;
      return fixed;
    });
    if (st.session === "server" && o.server) {
      tr.sessions.forEach((name, si) => {
        const say = /stop/.test(st.sql) ? o.server?.[name]?.crash : o.server?.[name]?.restart;
        if (say) ops[si] = { sql: say, tone: "mute" };
      });
    }
    const out: SessionStep = { ops, note: src.note };
    if (!o.noSnaps && src.snaps) out.snaps = src.snaps;
    if (o.locks && src.locks) {
      out.locks = (st.locks ?? [])
        .filter((l) => o.locks!.includes(l.type))
        .map((l): LockReq => ({ txn: l.session, obj: lockObj(l), mode: l.mode, granted: l.granted }));
    }
    if (src.db && "columns" in src.db) {
      const table = src.db as Table;
      const names = table.columns.map((c) => (typeof c === "string" ? c : c.name));
      if (o.cell) {
        const k = names.indexOf(o.cell.key[0]);
        const c = names.indexOf(o.cell.col);
        const row = table.rows.find((r) => String(r[k]) === o.cell!.key[1]);
        out.db = { [o.cell.label]: row ? (row[c] as string) : null };
      } else if (o.db) {
        // a table has no order; show it by its first column, so a row doesn't jump when a new version lands elsewhere on the page
        const byFirst = (a: (string | number | boolean | null)[], b: (string | number | boolean | null)[]) =>
          String(a[0]).localeCompare(String(b[0]), "en", { numeric: true });
        table.rows = [...table.rows].sort(byFirst);
        if (o.cols) {
          const at = o.cols.map((c) => names.indexOf(c));
          out.db = { columns: o.cols, rows: table.rows.map((r) => at.map((j) => r[j])) };
        } else out.db = table;
      }
    }
    return out;
  });
}

/** the provenance object a SessionLanes run reads, without shipping the capture */
export const runTrace = (t: Capture) => provOf(t) as unknown as PgTrace;
