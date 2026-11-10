import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { logicalJoin, runJoin } from "./join.ts";
// @ts-ignore
import { fixture } from "./fixture.ts";
import type { JTable } from "./join";

type JoinFix = { left: JTable; right: JTable; on: [string, string]; kinds: Record<string, { columns: string[]; rows: (string | number | null)[][] }> };

const bag = (rows: unknown[][]) => rows.map((r) => JSON.stringify(r.map((v) => (v === null ? null : String(v))))).sort();

test("every algorithm returns exactly what postgres returns, for every join kind", () => {
  const f = fixture<JoinFix>("joins.json");
  for (const algo of ["nested-loop", "index-nl", "hash", "merge"] as const)
    for (const kind of ["inner", "left", "semi", "anti"] as const) {
      const run = runJoin(f.left, f.right, f.on, algo, kind);
      assert.deepEqual(bag(run.output), bag(f.kinds[kind].rows), `${algo} ${kind}`);
      // and with a tiny work_mem the hash join batches but still agrees
      if (algo === "hash") {
        const small = runJoin(f.left, f.right, f.on, algo, kind, { workMem: 2 });
        assert.ok(small.steps[small.steps.length - 1].c.batches > 1);
        assert.deepEqual(bag(small.output), bag(f.kinds[kind].rows));
      }
    }
});

test("the logical join (cross product + padding) matches postgres for all six kinds", () => {
  const f = fixture<JoinFix>("joins.json");
  for (const kind of ["inner", "left", "right", "full", "semi", "anti"] as const)
    assert.deepEqual(bag(logicalJoin(f.left, f.right, f.on, kind).rows.map((r: { row: unknown[] }) => r.row)), bag(f.kinds[kind].rows), kind);
});

test("nested loop compares n×m, hash compares only within buckets", () => {
  const f = fixture<JoinFix>("joins.json");
  const nl = runJoin(f.left, f.right, f.on, "nested-loop", "inner");
  const h = runJoin(f.left, f.right, f.on, "hash", "inner");
  const last = (r: { steps: { c: { comparisons: number } }[] }) => r.steps[r.steps.length - 1].c.comparisons;
  assert.equal(last(nl), f.left.rows.length * f.right.rows.length);
  assert.ok(last(h) < last(nl));
});
