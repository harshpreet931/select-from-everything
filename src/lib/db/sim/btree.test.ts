import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { BPlusTree, btreeSteps } from "./btree.ts";
// @ts-ignore
import { fixture } from "./fixture.ts";

function check(t: BPlusTree, inserted: number[]) {
  const leaves = t.leaves();
  // same depth: every leaf reached by the same number of hops
  const depth = (id: string, d: number): number[] => {
    const n = t.nodes.get(id)!;
    return n.kids ? n.kids.flatMap((c: string) => depth(c, d + 1)) : [d];
  };
  assert.equal(new Set(depth(t.root, 0)).size, 1, "leaves at different depths");
  // in order, no loss
  const keys = leaves.flatMap((l: { keys: number[] }) => l.keys);
  assert.deepEqual(keys, [...new Set(inserted)].sort((a, b) => a - b));
  // capacity + separators bound their subtrees
  const range = (id: string): [number, number] => {
    const n = t.nodes.get(id)!;
    assert.ok(n.keys.length <= t.order, `${id} over capacity`);
    if (!n.kids) return [n.keys[0], n.keys[n.keys.length - 1]];
    assert.equal(n.kids.length, n.keys.length + 1);
    const rs = n.kids.map(range);
    n.keys.forEach((s: number, i: number) => {
      assert.ok(rs[i][1] < s, `left of ${s} too big`);
      assert.ok(rs[i + 1][0] >= s, `right of ${s} too small`);
    });
    return [rs[0][0], rs[rs.length - 1][1]];
  };
  range(t.root);
  return leaves;
}

const shuffled = (n: number) => Array.from({ length: n }, (_, i) => i + 1).sort((a, b) => ((a * 7919) % 2003) - ((b * 7919) % 2003));

test("textbook: balanced, ordered, half-full nodes", () => {
  for (const order of [3, 4, 5]) {
    const t = new BPlusTree({ order, rules: "textbook", record: false });
    const ks = shuffled(300);
    ks.forEach((k) => t.insert(k));
    check(t, ks);
    for (const n of t.nodes.values()) if (n.id !== t.root) assert.ok(n.keys.length >= Math.floor(order / 2), `${n.id} under half full`);
  }
});

test("nbtree: balanced, ordered, high keys bound each page from above", () => {
  const t = new BPlusTree({ order: 4, rules: "nbtree", record: false });
  const ks = shuffled(200);
  ks.forEach((k) => t.insert(k));
  check(t, ks);
  for (const n of t.nodes.values()) {
    if (!n.right) {
      assert.equal(n.high, undefined, "rightmost pages have no high key");
      continue;
    }
    assert.ok(n.high !== undefined);
    assert.ok(Math.max(...n.keys) < n.high!, "keys below the high key");
    const r = t.nodes.get(n.right)!;
    assert.equal(r.level, n.level, "right link stays on its level");
  }
});

test("nbtree leaf fill matches postgres 18.6: ascending vs scattered inserts", () => {
  const f = fixture<{ seq: { leaves: number[] }; rnd: { leaves: number[] } }>("btree.json");
  // 407 int4 entries fit on an 8 KB leaf (8,152 usable bytes / (16 B tuple + 4 B line pointer))
  const seq = new BPlusTree({ order: 407, rules: "nbtree", record: false });
  for (let k = 1; k <= 2000; k++) seq.insert(k);
  assert.deepEqual(
    seq.leaves().map((l: { keys: number[] }) => l.keys.length),
    f.seq.leaves,
  );
  const rnd = new BPlusTree({ order: 407, rules: "nbtree", record: false });
  shuffled(2000).forEach((k) => rnd.insert(k));
  const counts = rnd.leaves().map((l: { keys: number[] }) => l.keys.length);
  const fill = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length / 407;
  assert.ok(Math.abs(counts.length - f.rnd.leaves.length) <= 2, `leaves ${counts.length} vs real ${f.rnd.leaves.length}`);
  assert.ok(Math.abs(fill(counts) - fill(f.rnd.leaves)) < 0.1, `fill ${fill(counts)} vs real ${fill(f.rnd.leaves)}`);
  assert.ok(fill(f.seq.leaves.slice(0, -1)) > 0.85 && fill(counts) < 0.75);
});

test("search and range walk the tree, the lab records a step per change", () => {
  const steps = btreeSteps(
    [...[10, 20, 30, 40, 50, 60, 70].map((k) => ({ op: "insert" as const, k })), { op: "search", k: 40 }, { op: "range", lo: 15, hi: 55 }],
    { order: 3 },
  );
  assert.ok(steps.some((s) => s.label === "root split"));
  const last = steps[steps.length - 1];
  assert.deepEqual(last.view.range, [15, 55]);
  const t = new BPlusTree({ order: 3, record: false });
  [10, 20, 30, 40, 50, 60, 70].forEach((k) => t.insert(k));
  assert.deepEqual(t.range(15, 55), [20, 30, 40, 50]);
  assert.equal(t.search(40), true);
  assert.equal(t.search(41), false);
});
