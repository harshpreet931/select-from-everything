import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { fromExplainJson, misestimates, planNodes, stoppedEarly } from "../fromTrace.ts";
// @ts-ignore
import { fixture } from "./fixture.ts";
import type { PlanNode } from "../views";

type ExFix = { plans: Record<string, { plan: unknown }> };
const byOp = (p: PlanNode, op: string) => planNodes(p).find((n: PlanNode) => n.op === op)!;

test("under a Limit, the scan stops early and isn't a misestimate (real plans)", () => {
  const f = fixture<ExFix>("explain.json");
  const limit = fromExplainJson(f.plans.limit.plan);
  const scan = byOp(limit, "Seq Scan");
  assert.ok(stoppedEarly(limit).has(scan.id));
  assert.equal(misestimates(limit, 2).has(scan.id), false, "est 12, actual 3 under a Limit: not flagged");
  // a Sort reads all its input: the scan below it ran to completion, the Sort itself stopped early
  const sorted = fromExplainJson(f.plans.sorted.plan);
  const early = stoppedEarly(sorted);
  assert.ok(early.has(byOp(sorted, "Sort").id));
  assert.equal(early.has(byOp(sorted, "Seq Scan").id), false);
  // nothing stops early in a plain hash join
  assert.equal(stoppedEarly(fromExplainJson(f.plans.join.plan)).size, 0);
});

const node = (id: string, op: string, est: number, act: number, kids: PlanNode[] = [], extra: Partial<PlanNode> = {}): PlanNode => ({
  id,
  op,
  est: { rows: est, startup: 0, total: 1 },
  actual: { rows: act, loops: 1 },
  kids,
  ...extra,
});

test("W1's case: an index scan estimated at 200 that returned 3 under a Limit", () => {
  const p = node("0", "Limit", 3, 3, [node("0.0", "Index Scan", 200, 3)]);
  assert.equal(misestimates(p).size, 0);
});

test("semi and anti joins stop the inner side, merge joins either side, subplans stop early", () => {
  const semi = node("0", "Nested Loop", 10, 10, [node("0.0", "Seq Scan", 10, 10), node("0.1", "Index Scan", 500, 1, [], { parent: "Inner" })], { join: "Semi" });
  assert.deepEqual([...stoppedEarly(semi)], ["0.1"]);
  assert.equal(misestimates(semi).size, 0);
  const merge = node("0", "Merge Join", 5, 5, [node("0.0", "Index Scan", 1000, 4), node("0.1", "Index Scan", 1000, 900)]);
  assert.deepEqual([...stoppedEarly(merge)].sort(), ["0.0", "0.1"]);
  const sub = node("0", "Seq Scan", 100, 100, [node("0.0", "Index Scan", 300, 1, [], { parent: "SubPlan" })]);
  assert.ok(stoppedEarly(sub).has("0.0"));
  // a hash semi join builds the whole inner side: the Hash (and what's under it) ran to completion
  const hsemi = node("0", "Hash Join", 10, 10, [node("0.0", "Seq Scan", 10, 10), node("0.1", "Hash", 50, 50, [node("0.1.0", "Seq Scan", 50, 50)])], { join: "Semi" });
  assert.equal(stoppedEarly(hsemi).size, 0);
});

test("a node that ran to completion and is 10x off is flagged, per loop; a node never executed is not", () => {
  const p = node("0", "Hash Join", 1000, 1000, [node("0.0", "Seq Scan", 10, 900), node("0.1", "Hash", 5, 5, [node("0.1.0", "Seq Scan", 5, 5)])]);
  assert.deepEqual([...misestimates(p).keys()], ["0.0"]);
  const nl = node("0", "Nested Loop", 100, 100, [node("0.0", "Seq Scan", 10, 10), { ...node("0.1", "Index Scan", 1, 10), actual: { rows: 10, loops: 10 } }]);
  assert.ok(misestimates(nl).has("0.1"), "10 rows per loop against 1 estimated per loop");
  const never = node("0", "Hash Join", 0, 0, [{ ...node("0.0", "Seq Scan", 500, 0), actual: { rows: 0, loops: 0 } }, node("0.1", "Hash", 0, 0)]);
  assert.equal(misestimates(never).has("0.0"), false);
});

test("each 'Rows Removed by ...' keeps its own name, and zero counts are dropped like text EXPLAIN", () => {
  const raw = [
    {
      Plan: {
        "Node Type": "Bitmap Heap Scan",
        "Relation Name": "t",
        "Recheck Cond": "(a > 1)",
        Filter: "(b = 2)",
        "Rows Removed by Index Recheck": 5,
        "Rows Removed by Filter": 0,
        "Plan Rows": 1,
        "Actual Rows": 1,
        "Actual Loops": 1,
        Plans: [{ "Node Type": "Index Scan", "Index Name": "t_a", "Rows Removed by Index Recheck": 0, "Plan Rows": 1, "Actual Rows": 1, "Actual Loops": 1 }],
      },
    },
  ];
  const p = fromExplainJson(raw);
  assert.ok(p.detail!.includes("Rows Removed by Index Recheck: 5"));
  assert.ok(!p.detail!.some((d: string) => d.startsWith("Rows Removed by Filter")), "a zero filter count isn't shown");
  assert.ok(!p.kids[0].detail!.some((d: string) => d.startsWith("Rows Removed")), "a zero recheck count isn't shown");
});

test("no captured plan in the repo shows a zero 'Rows Removed' line or a relabelled recheck", async () => {
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("../../../../content/", import.meta.url));
  let plans = 0;
  for (const part of readdirSync(root)) {
    const dir = `${root}${part}/traces/`;
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x: string) => x.endsWith(".pgtrace.json"))) {
      const t = JSON.parse(readFileSync(dir + f, "utf8"));
      for (const st of t.steps) {
        if (!st.explain) continue;
        plans++;
        const raw = new Map<string, Record<string, unknown>>();
        const rawWalk = (n: Record<string, unknown>, id: string) => {
          raw.set(id, n);
          ((n.Plans as Record<string, unknown>[]) ?? []).forEach((c, i) => rawWalk(c, `${id}.${i}`));
        };
        const top = (Array.isArray(st.explain) ? st.explain[0] : st.explain) as Record<string, unknown>;
        rawWalk((top.Plan ?? top) as Record<string, unknown>, "0");
        for (const node of planNodes(fromExplainJson(st.explain))) {
          for (const d of node.detail ?? []) {
            assert.doesNotMatch(d, /^Rows Removed by [^:]+: 0$/, `${part}/${f}: ${node.op}`);
            const m = /^(Rows Removed by [^:]+): (.+)$/.exec(d);
            if (m) assert.equal(String(raw.get(node.id)![m[1]]), m[2], `${part}/${f}: ${node.op} ${m[1]}`);
          }
        }
      }
    }
  }
  assert.ok(plans > 0);
});

test("SubPlan, InitPlan and CTE labels survive the conversion", () => {
  const raw = {
    Plan: {
      "Node Type": "Seq Scan",
      "Relation Name": "o",
      Filter: "(EXISTS(SubPlan 1))",
      Plans: [
        { "Node Type": "Index Scan", "Parent Relationship": "SubPlan", "Subplan Name": "SubPlan 1", "Plan Rows": 1 },
        { "Node Type": "CTE Scan", "Parent Relationship": "InitPlan", "Subplan Name": "CTE recent", "Plan Rows": 5 },
      ],
    },
  };
  const p = fromExplainJson(raw);
  assert.deepEqual(
    p.kids.map((k: PlanNode) => [k.parent, k.subplan]),
    [
      ["SubPlan", "SubPlan 1"],
      ["InitPlan", "CTE recent"],
    ],
  );
});

test("runtime lines match text EXPLAIN ANALYZE (json and text captured from PGlite 0.5.12, 18.6)", () => {
  const lines = (n: Record<string, unknown>) => fromExplainJson({ Plan: n }).detail;
  assert.deepEqual(lines({ "Node Type": "Bitmap Heap Scan", "Exact Heap Blocks": 758, "Lossy Heap Blocks": 0 }), ["Heap Blocks: exact=758"]);
  assert.deepEqual(lines({ "Node Type": "Bitmap Heap Scan", "Exact Heap Blocks": 12, "Lossy Heap Blocks": 340 }), ["Heap Blocks: exact=12 lossy=340"]);
  assert.deepEqual(lines({ "Node Type": "Sort", "Sort Method": "external merge", "Sort Space Used": 10048, "Sort Space Type": "Disk" }), [
    "Sort Method: external merge  Disk: 10048kB",
  ]);
  assert.deepEqual(
    lines({ "Node Type": "Hash", "Hash Buckets": 16384, "Original Hash Buckets": 16384, "Hash Batches": 16, "Original Hash Batches": 16, "Peak Memory Usage": 409 }),
    ["Buckets: 16384  Batches: 16  Memory Usage: 409kB"],
  );
  assert.deepEqual(lines({ "Node Type": "Hash", "Hash Buckets": 65536, "Original Hash Buckets": 1024, "Hash Batches": 4, "Original Hash Batches": 1, "Peak Memory Usage": 3073 }), [
    "Buckets: 65536 (originally 1024)  Batches: 4 (originally 1)  Memory Usage: 3073kB",
  ]);
  assert.deepEqual(lines({ "Node Type": "Aggregate", Strategy: "Hashed", "Planned Partitions": 4, "HashAgg Batches": 341, "Peak Memory Usage": 169, "Disk Usage": 11984 }), [
    "Planned Partitions: 4  Batches: 341  Memory Usage: 169kB  Disk Usage: 11984kB",
  ]);
  assert.deepEqual(
    lines({ "Node Type": "Memoize", "Cache Key": "t.k", "Cache Mode": "binary", "Cache Hits": 3999, "Cache Misses": 1000, "Cache Evictions": 0, "Cache Overflows": 0, "Peak Memory Usage": 49 }),
    ["Cache Key: t.k", "Cache Mode: binary", "Hits: 3999  Misses: 1000  Evictions: 0  Overflows: 0  Memory Usage: 49kB"],
  );
});

test("a lossy bitmap's index scan counts pages, not rows: not flagged (BRIN, real postgres 18.6 shape)", () => {
  const bitmap = (exact: number, lossy: number) =>
    fromExplainJson({
      Plan: {
        "Node Type": "Bitmap Heap Scan",
        "Relation Name": "orders",
        "Plan Rows": 858,
        "Actual Rows": 859,
        "Actual Loops": 1,
        "Exact Heap Blocks": exact,
        "Lossy Heap Blocks": lossy,
        Plans: [{ "Node Type": "Bitmap Index Scan", "Index Name": "orders_at_brin", "Plan Rows": 952, "Actual Rows": 80, "Actual Loops": 1 }],
      },
    });
  assert.equal(misestimates(bitmap(0, 8)).size, 0, "BRIN: 8 lossy pages reported as 80 rows");
  assert.ok(misestimates(bitmap(8, 0)).has("0.0"), "an exact bitmap's count is real rows");
});

test("Gather nodes show Workers Planned and Launched like text EXPLAIN", () => {
  const p = fromExplainJson({ Plan: { "Node Type": "Gather", "Workers Planned": 2, "Workers Launched": 0, "Plan Rows": 10, Plans: [{ "Node Type": "Seq Scan", "Relation Name": "t", "Parent Relationship": "Outer", "Plan Rows": 5 }] } });
  assert.deepEqual(p.detail?.slice(0, 2), ["Workers Planned: 2", "Workers Launched: 0"]);
});

test("PG 18 fractional per-loop rows survive the adapter", () => {
  const p = fromExplainJson({ Plan: { "Node Type": "Index Scan", "Plan Rows": 1, "Actual Rows": 0.5, "Actual Loops": 4 } });
  assert.equal(p.actual?.rows, 0.5);
});

test("pg 18's Disabled: true comes through as disabled", () => {
  const p = fromExplainJson({ Plan: { "Node Type": "Seq Scan", "Relation Name": "t", Disabled: true, "Plan Rows": 3 } });
  assert.equal(p.disabled, true);
  assert.equal(fromExplainJson({ Plan: { "Node Type": "Seq Scan", "Plan Rows": 3, Disabled: false } }).disabled, undefined);
});

test("partition pruning: Subplans Removed is a detail line, a pruned-at-run-time child is never executed (real postgres 18.6)", async () => {
  const fs = await import("node:fs");
  const t = JSON.parse(fs.readFileSync(new URL("../../../../content/scale/traces/pruning.pgtrace.json", import.meta.url), "utf8"));
  const planned = fromExplainJson(t.steps[5].explain);
  assert.ok(byOp(planned, "Append").detail?.includes("Subplans Removed: 2"));
  const run = fromExplainJson(t.steps[6].explain);
  const never = planNodes(run).filter((n: PlanNode) => n.actual?.loops === 0);
  assert.equal(never.length, 2, "two partitions the executor skipped");
  const off = misestimates(run);
  for (const n of never) assert.equal(off.has(n.id), false, "a node that never ran isn't a misestimate");
  assert.ok(!byOp(run, "Append").detail?.some((d: string) => d.startsWith("Subplans Removed")), "0 removed prints nothing");
});
