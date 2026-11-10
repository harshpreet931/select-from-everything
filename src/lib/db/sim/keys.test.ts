import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { cmpKey } from "../keys.ts";

test("keys compare column by column: numbers as numbers, text as text, prefixes match", () => {
  assert.ok(cmpKey(9, 10) < 0, "9 before 10, not after (numbers, not strings)");
  assert.ok(cmpKey("(1, 9)", "(1, 10)") < 0);
  assert.ok(cmpKey("(2, 1)", "(1, 99)") > 0);
  assert.equal(cmpKey("(1, 5)", 1), 0, "a one-column bound matches every (1, …) key");
  assert.ok(cmpKey("Ana Lima", "Grace Okafor") < 0);
  assert.equal(cmpKey("José Silva", "José Silva"), 0);
  // a range [lo, hi] is lo <= key <= hi under cmpKey
  const inRange = (k: string, lo: string | number, hi: string | number) => cmpKey(k, lo) >= 0 && cmpKey(k, hi) <= 0;
  assert.deepEqual(["(1, 1)", "(1, 4)", "(2, 1)", "(3, 2)"].filter((k) => inRange(k, 1, 2)), ["(1, 1)", "(1, 4)", "(2, 1)"]);
  assert.deepEqual(["(1, 1)", "(1, 4)", "(2, 1)"].filter((k) => inRange(k, "(1, 2)", "(1, 9)")), ["(1, 4)"]);
});
