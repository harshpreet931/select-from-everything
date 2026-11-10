import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { runVolcano, withSim } from "./volcano.ts";
// @ts-ignore
import { fromExplainJson, planNodes } from "../fromTrace.ts";
// @ts-ignore
import { fixture } from "./fixture.ts";
import type { PlanNode, Table } from "../views";

type ExFix = { products: Table; orders: Table; plans: Record<string, { sql: string; plan: unknown }>; results: Record<string, Table> };

const specs: Record<string, PlanNode["sim"][]> = {
  // pre-order: root first
  limit: [{ count: 3 }, { table: "products", where: [["price", ">", 50]], cols: ["id", "name", "price"] }],
  sorted: [{ count: 3 }, { key: "price", desc: true }, { table: "products", where: [["price", ">", 50]], cols: ["id", "name", "price"] }],
  join: [{ on: ["product_id", "id"] }, { table: "orders" }, {}, { table: "products", where: [["price", ">", 30]] }],
  logical: [
    { count: 3 },
    { key: "avg_price", desc: true },
    { key: "category", aggs: [{ fn: "count", as: "n" }, { fn: "avg", col: "price", as: "avg_price" }], where: [["n", ">=", 3]] },
    { table: "products", where: [["discontinued", "false"]] },
  ],
};

test("per-node rows equal EXPLAIN ANALYZE actual rows on postgres 18.6", () => {
  const f = fixture<ExFix>("explain.json");
  for (const [name, sp] of Object.entries(specs)) {
    const plan = withSim(fromExplainJson(f.plans[name].plan), sp);
    const run = runVolcano(plan, { products: f.products, orders: f.orders });
    for (const n of planNodes(plan)) {
      assert.equal(run.counts[n.id].rows, n.actual!.rows, `${name}: ${n.op} (${n.id})`);
      if (n.removed != null) assert.equal(run.counts[n.id].removed, n.removed, `${name}: ${n.op} rows removed`);
    }
  }
});

test("the output matches the real result, and LIMIT stops the scan early", () => {
  const f = fixture<ExFix>("explain.json");
  const plan = withSim(fromExplainJson(f.plans.limit.plan), specs.limit);
  const run = runVolcano(plan, { products: f.products, orders: f.orders });
  assert.deepEqual(
    run.output.map((r: Record<string, unknown>) => [String(r.id), String(r.name), String(r.price)]),
    f.results.limit.rows.map((r) => r.map(String)),
  );
  const scan = planNodes(plan)[1].id;
  assert.ok(run.counts[scan].rows + run.counts[scan].removed < f.products.rows.length, "the scan never reached the end of the table");
  assert.equal(run.events.filter((e: { kind: string; node: string }) => e.kind === "eof" && e.node === scan).length, 0, "the scan never hit EOF");
});

test("fromExplainJson names nodes the way text EXPLAIN does", () => {
  const f = fixture<ExFix>("explain.json");
  const ops = planNodes(fromExplainJson(f.plans.logical.plan)).map((n: PlanNode) => n.op);
  assert.deepEqual(ops, ["Limit", "Sort", "HashAggregate", "Seq Scan"]);
  const join = planNodes(fromExplainJson(f.plans.join.plan));
  assert.ok(join[0].detail?.some((d: string) => d.startsWith("Hash Cond:")));
});
