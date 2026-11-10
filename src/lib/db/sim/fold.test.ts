import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { foldGaps, foldRows } from "../../../components/figures/kit/fold.ts";

const hidden = (n: number, v: number[]) => foldGaps(n, v).reduce((a: number, g: { count: number }) => a + g.count, 0);

test("short tables are never folded", () => {
  assert.deepEqual(foldRows(5, 10, []), [0, 1, 2, 3, 4]);
  assert.deepEqual(foldRows(11, 10, []), Array.from({ length: 11 }, (_, i) => i)); // one hidden row isn't worth a line
});

test("marked rows stay visible wherever they are, up to maxRows of them", () => {
  // the reported bug: marked rows between the shrunken head and maxRows went missing
  for (const marked of [[9], [11], [8, 9, 30], [0, 39], [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]]) {
    const v = foldRows(40, 10, marked);
    for (const m of marked.slice(0, 10)) assert.ok(v.includes(m), `row ${m} hidden (marked ${marked})`);
    assert.equal(v.length + hidden(40, v), 40, "every row is either drawn or counted in a gap");
    assert.deepEqual([...v].sort((a, b) => a - b), v, "drawn in order");
  }
});

test("unmarked rows fill the rest of the room from the top, and gaps are honest", () => {
  const v = foldRows(24, 10, [21, 22]);
  // 8 unmarked rows from the top, the 2 marked ones, and row 23 (a lone hidden row is drawn instead)
  assert.deepEqual(v, [0, 1, 2, 3, 4, 5, 6, 7, 21, 22, 23]);
  assert.deepEqual(foldGaps(24, v), [{ at: 21, count: 13 }]);
});

test("a single-row hole is drawn, not folded", () => {
  for (const marked of [[10], [9, 11], [0, 2, 25]]) {
    const v = foldRows(30, 10, marked);
    assert.ok(foldGaps(30, v).every((g: { count: number }) => g.count > 1), `no "… 1 more" lines (marked ${marked})`);
    assert.equal(v.length + hidden(30, v), 30);
  }
});

test("a clause that removes more rows than maxRows draws maxRows of them and counts the rest", () => {
  const removed = Array.from({ length: 30 }, (_, i) => i + 5); // rows 5..34 of 50 struck
  const v = foldRows(50, 8, removed);
  assert.ok(v.length <= 10, `drew ${v.length} rows`);
  assert.deepEqual(v.filter((i: number) => removed.includes(i)), removed.slice(0, 8));
  assert.equal(v.length + hidden(50, v), 50);
});
