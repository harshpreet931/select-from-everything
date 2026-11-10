"use client";

import { Fragment, useState } from "react";
import { Chip, FIG_TABLE, Legend, NARR, ring, tint } from "@/components/figures/kit";
import type { LockReq } from "@/lib/db/views";
import { CONFLICTS, LOCK_MODES } from "@/lib/db/locks";

// the lock manager's view: per object, who holds a lock (solid meta) and who is queued
// behind them (dashed, in arrival order). the queue is fifo: a waiting ACCESS EXCLUSIVE
// blocks everyone who arrives after it, even readers that don't conflict with the holder.
// the 8 × 8 matrix is the table-level conflict table; hover a mode to see what it blocks.
// (measured in fixtures/locks.json: each mode held in a prepared transaction, each other
// mode requested with NOWAIT; the table itself lives in @/lib/db/locks, tested in sim/locks.test.ts.)
//
//   <LockTable requests={[{ txn: "T1", obj: "accounts", mode: "AccessShareLock", granted: true }, ...]} matrix />

const SHORT = ["AS", "RS", "RX", "SUX", "S", "SRX", "X", "AX"];

export function LockTable({ requests, matrix }: { requests: LockReq[]; matrix?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const objs = [...new Set(requests.map((r) => r.obj))];
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      {requests.length > 0 && (
        <div className="grid gap-2" aria-label="locks per object">
          {objs.map((o) => {
            const held = requests.filter((r) => r.obj === o && r.granted);
            const queue = requests.filter((r) => r.obj === o && !r.granted);
            return (
              <div key={o} className="grid gap-1.5 rounded-md bg-well px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)] @min-[520px]:grid-cols-[10ch_minmax(0,1fr)_minmax(0,1.4fr)] @min-[520px]:items-center">
                <span className="text-hi">{o}</span>
                <span className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-[10px] text-faint">held</span>
                  {held.map((r, i) => (
                    <Chip key={i} tone="meta" title={`${r.txn} holds ${r.mode}`}>
                      {r.txn} {r.mode.replace(/Lock$/, "")}
                    </Chip>
                  ))}
                  {!held.length && <span className="text-faint">·</span>}
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-[10px] text-faint">queue</span>
                  {queue.map((r, i) => (
                    <Fragment key={i}>
                      {i > 0 && <span className="text-faint">←</span>}
                      <Chip tone="mute" dashed title={`${r.txn} waits for ${r.mode}`}>
                        {r.txn} {r.mode.replace(/Lock$/, "")}
                      </Chip>
                    </Fragment>
                  ))}
                  {!queue.length && <span className="text-faint">empty</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {matrix && (
        <div className="grid gap-2">
          <div className="min-w-0 overflow-x-auto">
            <table className={`w-auto border-collapse text-11 tabular ${FIG_TABLE}`} onMouseLeave={() => setHover(null)}>
              <thead>
                <tr>
                  <th className="border-0 px-1.5 py-1 text-left font-normal text-faint">held ↓ wanted →</th>
                  {SHORT.map((s, j) => (
                    <th key={s} className="border-0 px-1 py-1 font-normal" style={{ color: hover === j ? "var(--hot)" : "var(--mute)" }} title={LOCK_MODES[j]}>
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LOCK_MODES.map((m, i) => (
                  <tr key={m}>
                    <th className="border-0 px-1.5 py-0.5 text-left font-normal whitespace-nowrap">
                      <button type="button" className="text-left" style={{ color: hover === i ? "var(--hot)" : "var(--ink)" }} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}>
                        {m.toLowerCase()} <span className="text-faint">{SHORT[i]}</span>
                      </button>
                    </th>
                    {CONFLICTS[i].map((c, j) => {
                      const lit = hover !== null && (hover === i || hover === j) && c;
                      return (
                        <td key={j} className="p-[2px] text-center">
                          <span
                            className="inline-flex size-6 items-center justify-center rounded-xs transition-[background-color,box-shadow] duration-150"
                            style={{ background: c ? tint(lit ? "hot" : "meta", lit ? 22 : 14) : undefined, boxShadow: c ? ring(lit ? "hot" : "meta", 50) : ring("line") }}
                            aria-label={`${LOCK_MODES[i]} ${c ? "conflicts with" : "is compatible with"} ${LOCK_MODES[j]}`}
                          >
                            {c ? <span style={{ color: lit ? "var(--hot)" : "var(--meta)" }}>×</span> : null}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={NARR} aria-live="polite">
            {hover === null
              ? "hover a mode: × marks what it can't share a table with."
              : `${LOCK_MODES[hover].toLowerCase()} conflicts with ${LOCK_MODES.filter((_, j) => CONFLICTS[hover][j])
                  .map((x) => x.toLowerCase())
                  .join(", ")}.`}
          </p>
          <Legend items={[["meta", "conflict (the lock manager makes one wait)"], ["hot", "the mode you're pointing at"]]} />
        </div>
      )}
    </div>
  );
}
