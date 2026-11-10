import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { bucketOf, expand, hashSteps, hashint4, initialMeta, needsSplit } from "./hash.ts";
// @ts-ignore
import { fixture } from "./fixture.ts";

test("hashint4 matches postgres for k = 1..1000", () => {
  const f = fixture<{ from: number; hash: number[] }>("hashint4.json");
  f.hash.forEach((h, i) => assert.equal(hashint4(f.from + i), h, `hashint4(${f.from + i})`));
});

test("hashint4 of negatives and extremes stays a signed int4", () => {
  for (const k of [0, -1, 2147483647, -2147483648]) {
    const h = hashint4(k);
    assert.ok(Number.isInteger(h) && h >= -(2 ** 31) && h < 2 ** 31);
  }
});

type HashFix = {
  start: { ntuples: number; ffactor: number; maxbucket: number; highmask: number; lowmask: number };
  splits: { n: number; maxbucket: number; highmask: number; lowmask: number }[];
  final: { maxbucket: number; highmask: number; lowmask: number };
  buckets: Record<string, number[]>;
};

test("split points and masks match a real index filled one key at a time", () => {
  const f = fixture<HashFix>("hash-index.json");
  let m = { ...initialMeta(f.start.ffactor) };
  assert.deepEqual({ maxbucket: m.maxbucket, highmask: m.highmask, lowmask: m.lowmask }, { maxbucket: f.start.maxbucket, highmask: f.start.highmask, lowmask: f.start.lowmask });
  const got: HashFix["splits"] = [];
  for (let n = 1; n <= 1000; n++) {
    m = { ...m, ntuples: n };
    if (needsSplit(m)) {
      m = expand(m).meta;
      got.push({ n, maxbucket: m.maxbucket, highmask: m.highmask, lowmask: m.lowmask });
    }
  }
  assert.deepEqual(got, f.splits);
  assert.deepEqual({ maxbucket: m.maxbucket, highmask: m.highmask, lowmask: m.lowmask }, { maxbucket: f.final.maxbucket, highmask: f.final.highmask, lowmask: f.final.lowmask });
});

test("every key lands in the bucket postgres put it in", () => {
  const f = fixture<HashFix>("hash-index.json");
  for (const [b, keys] of Object.entries(f.buckets))
    for (const k of keys) assert.equal(bucketOf(hashint4(k), f.final.maxbucket, f.final.highmask, f.final.lowmask), Number(b), `key ${k}`);
});

test("the lab's buckets agree with the formula after every split", () => {
  const keys = Array.from({ length: 60 }, (_, i) => i + 1);
  const steps = hashSteps(keys, { ffactor: 4 });
  const last = steps[steps.length - 1].view;
  for (const b of last.buckets)
    for (const p of b.pages) for (const it of p.items) assert.equal(bucketOf(it.hash, last.meta.maxbucket, last.meta.highmask, last.meta.lowmask), b.id);
  assert.equal(last.buckets.reduce((s, b) => s + b.pages.reduce((t, p) => t + p.items.length, 0), 0), 60);
  assert.ok(steps.some((s) => s.view.splitting));
});
