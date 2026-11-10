// two recovery models.
//
// recoverySteps: model of postgres crash recovery, simplified: redo only (postgres has no
// undo pass: aborted and in-progress transactions just never get a commit record, and
// their versions are invisible), one page per block reference. the redo rule is the real
// one (xlogutils.c, XLogReadBufferForRedoExtended): a block with a full-page image is
// restored from it, no questions asked (BLK_RESTORED); otherwise the record is replayed
// only if the page's LSN is older than the record's END (BLK_NEEDS_REDO), else skipped
// (BLK_DONE). after a replay the page's LSN becomes the record's end.
//
// ariesSteps: the textbook ARIES algorithm (analysis, redo, undo with CLRs), simulated.
// postgres doesn't do this; the figure says so. tested in wal.test.ts.

import type { AriesRec, AriesView, Stepped, WalPage, WalView } from "../views";

const lab = (r: { rmgr: string; type: string }) => `${r.rmgr} ${r.type}`;
const off = (n: number, base: number) => `+0x${Math.max(0, n - base).toString(16).toUpperCase().padStart(3, "0")}`;

export function recoverySteps(v: WalView): Stepped<WalView>[] {
  const steps: Stepped<WalView>[] = [];
  const recs = [...v.records].sort((a, b) => a.lsn - b.lsn);
  const pages: WalPage[] = (v.pages ?? []).map((p) => ({ ...p }));
  const durable = recs.filter((r) => r.lsn < v.flush).length;
  steps.push({
    view: { ...v, records: recs, pages: pages.map((p) => ({ ...p })) },
    label: "running",
    note: `${recs.length} records in the log, ${durable} of them flushed to disk. the pages in memory are ahead of their copies on disk: that's fine, the log has every change.`,
  });
  const lost = recs.map((r, i) => (r.lsn >= v.flush ? i : -1)).filter((i) => i >= 0);
  const replay: Record<number, "applied" | "skipped" | "lost"> = Object.fromEntries(lost.map((i) => [i, "lost"]));
  const onDisk = pages.map((p) => ({ ...p, lsn: p.disk ?? p.lsn, dirty: false }));
  steps.push({
    view: { ...v, records: recs, crashed: true, replay: { ...replay }, pages: onDisk.map((p) => ({ ...p })) },
    label: "crash",
    note: `crash. memory is gone: every dirty page and ${lost.length ? `the ${lost.length} record${lost.length > 1 ? "s" : ""} still in wal_buffers` : "nothing else"}. what survives is the WAL up to the flush line and whatever pages had been written.`,
  });
  const from = v.redo ?? v.base;
  recs.forEach((r, i) => {
    if (r.lsn < from || r.lsn >= v.flush) return;
    const touched = r.blocks ?? [];
    let did: "applied" | "skipped" = "applied";
    const parts: string[] = [];
    const end = r.end ?? r.lsn + r.len;
    for (const b of touched) {
      const label = `${b.rel}·${b.block}`;
      const p = onDisk.find((x) => x.label === label);
      if (!p) continue;
      if (b.fpi) {
        parts.push(`the record carries a full-page image of ${label}: the page is restored from it, whatever was on disk`);
        p.lsn = end;
        p.dirty = true;
      } else if (p.lsn < end) {
        parts.push(`${label} is at ${off(p.lsn, v.base)}, older than the record's end ${off(end, v.base)}: replay it`);
        p.lsn = end;
        p.dirty = true;
      } else {
        did = "skipped";
        parts.push(`${label} is at ${off(p.lsn, v.base)}, not older than the record's end: it already has this change, skip`);
      }
    }
    replay[i] = did;
    steps.push({
      view: { ...v, records: recs, crashed: true, applying: i, replay: { ...replay }, pages: onDisk.map((p) => ({ ...p })) },
      label: `redo ${lab(r)}`,
      note: touched.length ? `${lab(r)}: ${parts.join("; ") || "no page of ours"}.` : `${lab(r)}: no data page, it goes into the transaction status log (clog)${r.type === "COMMIT" ? `: xid ${r.xid} committed` : ""}.`,
    });
  });
  steps.push({
    view: { ...v, records: recs, crashed: true, replay: { ...replay }, pages: onDisk.map((p) => ({ ...p })) },
    label: "redo done",
    note: `redo done. every committed change is back. anything without a commit record (including the lost tail) is simply never visible: there is no undo pass.`,
  });
  return steps;
}

/* ---- ARIES, the textbook version ----------------------------------------------------- */

type Txn = AriesView["txns"][number];

export function ariesSteps(log0: AriesRec[], o: { flushed: number; pages: Record<string, number> }): Stepped<AriesView>[] {
  const steps: Stepped<AriesView>[] = [];
  const log = log0.map((r) => ({ ...r }));
  let txns: Txn[] = [];
  let dpt: { page: string; recLsn: number }[] = [];
  const pages = Object.entries(o.pages).map(([page, lsn]) => ({ page, lsn }));
  let marks: AriesView["marks"] = {};
  const snap = (pass: AriesView["pass"], note: string, label: string, at?: number) =>
    steps.push({
      view: { log: log.map((r) => ({ ...r })), pass, at, txns: txns.map((t) => ({ ...t })), dpt: dpt.map((d) => ({ ...d })), pages: pages.map((p) => ({ ...p })), marks: { ...marks }, flushed: o.flushed },
      note,
      label,
    });

  snap("before", `the log as it was written. everything up to lsn ${o.flushed} reached disk.`, "the log");
  // the crash drops the unflushed tail
  const lost = log.filter((r) => r.lsn > o.flushed).map((r) => r.lsn);
  for (let i = log.length - 1; i >= 0; i--) if (log[i].lsn > o.flushed) log.splice(i, 1);
  snap("crash", `crash.${lost.length ? ` lsn ${lost.join(", ")} never reached disk and are gone.` : ""} the pages on disk are whatever was last written.`, "crash");

  // analysis: rebuild the transaction table and the dirty page table
  const start = [...log].reverse().find((r) => r.kind === "begin-ckpt")?.lsn ?? log[0]?.lsn ?? 0;
  for (const r of log) {
    if (r.lsn < start) continue;
    marks = { [r.lsn]: "scan" };
    let t = txns.find((x) => x.txn === r.txn);
    if (r.txn && !t && r.kind !== "end") {
      t = { txn: r.txn, status: "running", last: r.lsn };
      txns.push(t);
    }
    if (t) t.last = r.lsn;
    let what = "";
    if (r.kind === "update" || r.kind === "clr") {
      if (r.page && !dpt.some((d) => d.page === r.page)) {
        dpt.push({ page: r.page, recLsn: r.lsn });
        what = ` ${r.page} goes into the dirty page table with recLSN ${r.lsn}.`;
      }
    }
    if (r.kind === "commit" && t) t.status = "committed";
    if (r.kind === "end") txns = txns.filter((x) => x.txn !== r.txn);
    snap("analysis", `analysis reads lsn ${r.lsn} (${r.kind}${r.txn ? ` ${r.txn}` : ""}).${what}`, "analysis", r.lsn);
  }
  txns = txns.filter((t) => t.status !== "committed");
  txns.forEach((t) => (t.status = "aborting"));
  marks = {};
  snap("analysis", `analysis done. losers (no commit record): ${txns.map((t) => t.txn).join(", ") || "none"}. redo starts at the smallest recLSN, ${Math.min(...dpt.map((d) => d.recLsn))}.`, "losers");

  // redo: repeat history, including the losers' changes
  const redoFrom = dpt.length ? Math.min(...dpt.map((d) => d.recLsn)) : Infinity;
  for (const r of log) {
    if (r.lsn < redoFrom || (r.kind !== "update" && r.kind !== "clr") || !r.page) continue;
    const d = dpt.find((x) => x.page === r.page);
    const p = pages.find((x) => x.page === r.page)!;
    if (d && r.lsn >= d.recLsn && p.lsn < r.lsn) {
      p.lsn = r.lsn;
      marks = { ...marks, [r.lsn]: "redo" };
      snap("redo", `redo lsn ${r.lsn}: ${r.page}'s pageLSN was older, so apply it${r.txn && txns.some((t) => t.txn === r.txn) ? `, even though ${r.txn} is a loser (repeat history first, undo after)` : ""}.`, "redo", r.lsn);
    } else {
      marks = { ...marks, [r.lsn]: "skip" };
      snap("redo", `skip lsn ${r.lsn}: ${r.page} ${!d ? "isn't in the dirty page table" : `already has it (pageLSN ${p.lsn} ≥ ${r.lsn})`}.`, "redo", r.lsn);
    }
  }

  // undo: roll the losers back, newest change first, logging a CLR for each
  // numbered past every lsn ever handed out, the lost tail too: the figure still shows those
  // records struck through, and a CLR reusing one of their numbers reads as the same record
  let next = Math.max(0, ...log0.map((r) => r.lsn)) + 10;
  const toUndo = () => txns.map((t) => t.last).filter((l) => l > 0);
  while (toUndo().length) {
    const l = Math.max(...toUndo());
    const r = log.find((x) => x.lsn === l);
    const t = txns.find((x) => x.last === l)!;
    if (!r) {
      t.last = 0;
      continue;
    }
    if (r.kind === "update") {
      const clr: AriesRec = { lsn: next, txn: r.txn, kind: "clr", page: r.page, prev: t.last, undoNext: r.prev ?? 0, what: `undo ${r.lsn}` };
      next += 10;
      log.push(clr);
      const p = pages.find((x) => x.page === r.page);
      if (p) p.lsn = clr.lsn;
      t.last = r.prev ?? 0;
      marks = { ...marks, [r.lsn]: "undo", [clr.lsn]: "clr" };
      snap("undo", `undo lsn ${r.lsn} (${r.txn} changed ${r.page}): write CLR ${clr.lsn} with undoNext ${clr.undoNext || "none"}, so a crash during undo never undoes it twice.`, "undo", r.lsn);
    } else {
      t.last = r.kind === "clr" ? (r.undoNext ?? 0) : (r.prev ?? 0);
    }
    if (!t.last) {
      log.push({ lsn: next, txn: t.txn, kind: "end" });
      next += 10;
      txns = txns.filter((x) => x !== t);
      snap("undo", `${t.txn} is fully rolled back: write its END record.`, "end", log[log.length - 1].lsn);
    }
  }
  marks = {};
  snap("done", `recovered: winners' changes are all there, losers' changes are all undone. (postgres never runs this undo pass: it keeps old versions in the table instead.)`, "done");
  return steps;
}

/** a small textbook log: T1 commits, T2 doesn't, T3 is cut off by the crash */
export const ARIES_EXAMPLE: { log: AriesRec[]; flushed: number; pages: Record<string, number> } = {
  log: [
    { lsn: 10, txn: "T1", kind: "update", page: "P1", prev: 0, what: "x: 1 → 2" },
    { lsn: 20, txn: "T2", kind: "update", page: "P2", prev: 0, what: "y: 5 → 6" },
    { lsn: 30, txn: "T1", kind: "update", page: "P3", prev: 10, what: "z: 0 → 9" },
    { lsn: 40, txn: "T1", kind: "commit", prev: 30 },
    { lsn: 50, txn: "T2", kind: "update", page: "P1", prev: 20, what: "x: 2 → 3" },
    { lsn: 60, txn: "T1", kind: "end", prev: 40 },
    { lsn: 70, txn: "T3", kind: "update", page: "P3", prev: 0, what: "z: 9 → 4" },
  ],
  flushed: 60,
  pages: { P1: 10, P2: 0, P3: 0 },
};
