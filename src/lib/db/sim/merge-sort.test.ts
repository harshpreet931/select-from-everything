import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { mergeSort } from "./join.ts";
// @ts-ignore
import { joinRow } from "./volcano.ts";

test("mergeSort is stable and counts the same comparisons every time", () => {
  let n = 0;
  const xs = [5, 3, 5, 1, 4, 3, 2];
  const out = mergeSort(xs.map((v, i) => ({ v, i })), (a: { v: number }, b: { v: number }) => (n++, a.v - b.v));
  assert.deepEqual(out.map((x: { v: number }) => x.v), [1, 2, 3, 3, 4, 5, 5]);
  assert.deepEqual(out.filter((x: { v: number }) => x.v === 5).map((x: { i: number }) => x.i), [0, 2]);
  assert.equal(n, 13);
});

test("a joined row keeps the outer id; a clashing inner column moves aside", () => {
  assert.deepEqual(joinRow({ id: 1, name: "a" }, { id: 7, customer_id: 1 }), { id: 1, name: "a", "inner.id": 7, customer_id: 1 });
});
