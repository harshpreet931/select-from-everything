import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- plain .mjs from the capture tool
import { normalizeText } from "../../../../tools/pgtrace/lib/probes.mjs";
// @ts-ignore
import { masked } from "../../../../tools/pgtrace/lib/json.mjs";

test("pgtrace ignores VACUUM's timing noise when comparing, but keeps the log readable", () => {
  const log = (rate: string, cpu: string) => ["avg read rate: " + rate + " MB/s, avg write rate: 0.000 MB/s", "\tsystem usage: CPU: user: " + cpu + " s, system: 0.00 s, elapsed: <t> s", "buffer usage: 30 hits, 0 reads, 3 dirtied"];
  const a = { steps: [{ log: log("0.000", "0.00") }] };
  const b = { steps: [{ log: log("12.345", "0.01") }] };
  assert.deepEqual(masked(a), masked(b));
  assert.match(a.steps[0].log[0], /0\.000 MB\/s/, "the stored line is untouched");
  assert.notDeepEqual(masked({ steps: [{ log: ["buffer usage: 31 hits"] }] }), masked({ steps: [{ log: ["buffer usage: 30 hits"] }] }), "counts still compare");
  assert.equal(normalizeText("x system usage: CPU: user: 0.01 s"), "x");
});

test("pgtrace masks auto_explain durations and names the pids in lock-wait DETAIL lines", () => {
  assert.equal(normalizeText("duration: 0.247 ms  plan:"), "duration: <t> ms  plan:");
  const names = new Map([[123, "T1"], [124, "T2"], [125, "T3"]]);
  assert.equal(normalizeText("Process holding the lock: 123. Wait queue: 124, 125.", names), "Process holding the lock: T1. Wait queue: T2, T3.");
  assert.equal(normalizeText("Processes holding the lock: 123, 124. Wait queue: 125.", names), "Processes holding the lock: T1, T2. Wait queue: T3.");
});
