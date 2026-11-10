import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { traceChain, traceBTree, traceLanes, tracePool, traceWal, btreeFromPages, committedRows } from "../fromTrace.ts";
// @ts-ignore
import { fixture } from "./fixture.ts";
import type { PgTrace } from "../pgtrace";

test("the mini trace adapts to every view", () => {
  const t = fixture<PgTrace>("mini.pgtrace.json");
  const last = t.steps.length - 1;
  // after two HOT updates, id 1 has three versions linked by t_ctid
  const chain = traceChain(t, 2, "accounts", "id=1");
  assert.equal(chain.versions.length, 3);
  assert.deepEqual(chain.versions.map((v: { lp: number }) => v.lp), [1, 4, 5]);
  // after vacuum: a redirect to the survivor
  const after = traceChain(t, last, "accounts", "id=1");
  assert.deepEqual(after.versions.map((v: { lpFlags: string }) => v.lpFlags), ["redirect", "normal"]);
  const bt = traceBTree(t, last, "accounts_pkey")!;
  assert.ok(bt.nodes[bt.root]);
  const lanes = traceLanes(t);
  assert.equal(lanes.length, t.steps.length);
  assert.equal(typeof lanes[1].ops?.[0], "object");
  assert.ok(tracePool(t, 1)!.frames.length > 0);
  const wal = traceWal(t, 5)!;
  assert.ok(wal.records.some((r: { type: string }) => r.type === "COMMIT"));
  assert.ok(wal.records.every((r: { lsn: number }, i: number, a: { lsn: number }[]) => i === 0 || a[i - 1].lsn < r.lsn), "records in LSN order");
});

test("committed rows after each step are what a fresh reader sees", () => {
  const t = fixture<PgTrace>("mini.pgtrace.json");
  const rows = (i: number) => committedRows(t, t.steps[i], "accounts").rows.map((r: unknown[]) => r.join(" ")).sort();
  assert.deepEqual(rows(2), ["1 ada 100", "2 linus 50", "3 grace 75"]); // T1 not committed yet
  assert.deepEqual(rows(3), ["1 ada 120", "2 linus 50", "3 grace 75"]);
  assert.deepEqual(rows(6), ["1 ada 120", "3 grace 75", "4 linus 50"]);
});

test("a captured 10,000-key index becomes a two-level tree with high keys and sibling links", () => {
  const f = fixture<{ big: Parameters<typeof btreeFromPages>[0] }>("btree.json");
  const v = btreeFromPages(f.big);
  const root = v.nodes[v.root];
  assert.equal(root.level, 1);
  assert.equal(root.kids!.length, root.keys.length + 1);
  const leaves = Object.values(v.nodes).filter((n: { level: number }) => n.level === 0);
  assert.equal(leaves.length, root.kids!.length);
  assert.equal(leaves.filter((n: { right?: string }) => !n.right).length, 1, "one rightmost leaf");
  assert.ok(leaves.every((n: { right?: string; high?: unknown }) => !n.right || n.high !== undefined));
});
