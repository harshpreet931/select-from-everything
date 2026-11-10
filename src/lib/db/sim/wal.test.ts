import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { recoverySteps, ariesSteps, ARIES_EXAMPLE } from "./wal.ts";
// @ts-ignore
import { traceWal } from "../fromTrace.ts";
// @ts-ignore
import { fixture } from "./fixture.ts";
import type { PgTrace } from "../pgtrace";
import type { AriesRec } from "../views";

test("redo (FPI restore, then end-LSN rule) brings the on-disk page to the LSN postgres really had in memory", () => {
  const t = fixture<PgTrace>("mini.pgtrace.json");
  const i = 5; // after the non-HOT update committed
  const v = traceWal(t, i)!;
  const disk = t.steps[0].heap!.accounts[0].lsn!; // the page as of the checkpoint before the scenario
  const real = t.steps[i].heap!.accounts[0].lsn!;
  const pages = [{ label: "accounts·0", lsn: real, disk }];
  const steps = recoverySteps({ ...v, redo: t.steps[0].wal!.redo, pages });
  const last = steps[steps.length - 1].view;
  assert.equal(last.pages![0].lsn, real);
  // replay never touches a page that already has the change
  const again = recoverySteps({ ...v, redo: t.steps[0].wal!.redo, pages: [{ label: "accounts·0", lsn: real, disk: real }] });
  const replay = again[again.length - 1].view.replay ?? {};
  // a full-page image is restored no matter what (it rewinds the page to that image, so the
  // records after it replay again); records before the first FPI are skipped on an up-to-date page
  const touches = (r: { blocks?: { rel: string; block: number; fpi?: boolean }[] }) => r.blocks?.find((x) => x.rel === "accounts" && x.block === 0);
  const firstFpi = v.records.findIndex((r: { blocks?: { rel: string; block: number; fpi?: boolean }[] }) => touches(r)?.fpi);
  v.records.forEach((r: { blocks?: { rel: string; block: number; fpi?: boolean }[] }, k: number) => {
    const b = touches(r);
    if (!b || !replay[k]) return;
    if (b.fpi) assert.equal(replay[k], "applied");
    else if (firstFpi < 0 || k < firstFpi) assert.equal(replay[k], "skipped");
  });
  // without any FPI, an up-to-date page skips everything
  const plain = recoverySteps({
    base: 0, insert: 300, flush: 300, redo: 0,
    records: [{ lsn: 40, len: 60, end: 100, rmgr: "Heap", type: "INSERT", blocks: [{ rel: "t", block: 0 }] }, { lsn: 100, len: 60, end: 160, rmgr: "Heap", type: "UPDATE", blocks: [{ rel: "t", block: 0 }] }],
    pages: [{ label: "t·0", lsn: 160, disk: 160 }],
  });
  assert.deepEqual(plain[plain.length - 1].view.replay, { 0: "skipped", 1: "skipped" });
  assert.equal(again[again.length - 1].view.pages![0].lsn, real);
});

test("records past the flush line are lost in the crash", () => {
  const v = {
    base: 0,
    insert: 300,
    flush: 240,
    redo: 0,
    records: [
      { lsn: 40, len: 100, end: 140, rmgr: "Heap", type: "INSERT", blocks: [{ rel: "t", block: 0 }] },
      { lsn: 140, len: 100, end: 240, rmgr: "Transaction", type: "COMMIT", xid: 7 },
      { lsn: 240, len: 100, end: 340, rmgr: "Heap", type: "INSERT", blocks: [{ rel: "t", block: 0 }] },
    ],
    pages: [{ label: "t·0", lsn: 340, disk: 0 }],
  };
  const s = recoverySteps(v);
  const end = s[s.length - 1].view;
  assert.deepEqual(end.replay, { 0: "applied", 1: "applied", 2: "lost" });
  assert.equal(end.pages![0].lsn, 140);
});

test("ARIES: losers are undone with CLRs, winners stay, redo skips what's on disk", () => {
  const s = ariesSteps(ARIES_EXAMPLE.log, { flushed: ARIES_EXAMPLE.flushed, pages: ARIES_EXAMPLE.pages });
  const end = s[s.length - 1].view;
  const log: AriesRec[] = end.log;
  const clrs = log.filter((r) => r.kind === "clr");
  // T2 (no commit) had two updates: both get a CLR; T1 committed: none
  assert.deepEqual(clrs.map((r) => r.what).sort(), ["undo 20", "undo 50"]);
  assert.ok(clrs.every((r) => r.txn === "T2"));
  assert.ok(log.some((r) => r.kind === "end" && r.txn === "T2"));
  assert.equal(end.txns.length, 0);
  // P1 was on disk at lsn 10, so lsn 10 is skipped during redo
  assert.ok(s.some((x: { view: { pass: string; at?: number; marks?: Record<number, string> } }) => x.view.pass === "redo" && x.view.marks?.[10] === "skip"));
  // T3's update never reached disk
  assert.ok(!log.some((r) => r.txn === "T3"));
});

test("after the crash, CLRs never reuse an lsn the lost tail had", async () => {
  // @ts-ignore
  const { ariesSteps, ARIES_EXAMPLE } = await import("./wal.ts");
  const steps = ariesSteps(ARIES_EXAMPLE.log, { flushed: ARIES_EXAMPLE.flushed, pages: ARIES_EXAMPLE.pages });
  const last = steps[steps.length - 1].view;
  const lost = ARIES_EXAMPLE.log.filter((r: { lsn: number }) => r.lsn > ARIES_EXAMPLE.flushed).map((r: { lsn: number }) => r.lsn);
  const written = last.log.filter((r: { kind: string }) => r.kind === "clr" || r.kind === "end").map((r: { lsn: number }) => r.lsn);
  for (const l of written) assert.ok(!lost.includes(l), `lsn ${l} was lost in the crash`);
});
