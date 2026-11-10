import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-ignore -- plain .mjs from the capture tool
import { parseScenario } from "../../../../tools/pgtrace/lib/scenario.mjs";
// @ts-ignore
import { runScenario } from "../../../../tools/pgtrace/lib/run.mjs";

// a pglite capture must see the database a run block sees: same oids for the dataset's tables.
// pgtrace's inspection extensions are created after the dataset, so they can't shift them.
test("pgtrace on PGlite: shop.customers has the run blocks' oid (16385)", async () => {
  const sc = parseScenario(['-- @engine pglite', '-- @db shop', '-- @step T1 "oid"', "SELECT 'customers'::regclass::oid AS oid;", ""].join("\n"), "oid.scenario.sql");
  const { trace } = (await runScenario(sc)) as { trace: { steps: { result: { data: string[][] } }[] } };
  assert.equal(trace.steps[0].result.data[0][0], "16385");
  // and the golden of a real chapter agrees (system-catalog prints customers' oid from a run block)
  const golden = fs.readFileSync(new URL("../../../../content/execution/system-catalog.golden.json", import.meta.url), "utf8");
  assert.match(golden, /16385/);
});
