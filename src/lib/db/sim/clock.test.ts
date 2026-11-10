import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { poolSteps, workload } from "./clock.ts";

const POLICIES = ["clock-sweep", "lru", "fifo"] as const;

test("invariants hold on every step, for every policy and workload", () => {
  for (const policy of POLICIES)
    for (const w of ["hot+scan", "seqscan", "random"] as const)
      for (const frames of [4, 8, 16]) {
        const reqs = workload(w, frames);
        const steps = poolSteps(reqs, { frames, policy, ring: w === "random" ? undefined : 2 });
        assert.equal(steps.length, reqs.length + 1);
        steps.forEach((s, i) => {
          const v = s.view;
          assert.equal(v.frames.length, frames);
          const pages = v.frames.filter((f) => f.page).map((f) => `${f.page!.rel}·${f.page!.block}`);
          assert.equal(new Set(pages).size, pages.length, "a page sits in two frames");
          for (const f of v.frames) {
            assert.ok(f.usage >= 0 && f.usage <= 5);
            if (!f.page) assert.equal(f.usage, 0);
          }
          assert.equal(v.stats.hit + v.stats.read, i, "every request is a hit or a read");
          assert.ok(v.stats.written <= v.stats.evicted);
          if (i > 0) {
            const prev = steps[i - 1].view;
            const r = reqs[i - 1];
            const was = prev.frames.some((f) => f.page?.rel === r.rel && f.page?.block === r.block);
            assert.equal(v.hit, was, "hit iff the page was already there");
          }
        });
      }
});

test("clock sweep keeps a hot set through a big scan better than fifo", () => {
  const frames = 9;
  const reqs = workload("hot+scan", frames);
  const tail = (policy: (typeof POLICIES)[number], ring?: number) => {
    const s = poolSteps(reqs, { frames, policy, ring });
    const hot = Math.max(2, Math.floor(frames / 3));
    return s.slice(-hot).filter((x) => x.view.hit).length;
  };
  assert.ok(tail("clock-sweep", 2) >= tail("fifo"), "ring + clock should keep at least as many hot pages");
  assert.equal(tail("clock-sweep", 2), Math.max(2, Math.floor(frames / 3)), "with a ring, the scan can't flush the hot set");
});

test("the hand only moves on a miss, and a hit raises usage by one up to 5", () => {
  const reqs = Array.from({ length: 8 }, () => ({ rel: "t", block: 0 }));
  const s = poolSteps(reqs, { frames: 3, policy: "clock-sweep" });
  assert.deepEqual(
    s.map((x) => x.view.frames[0].usage),
    [0, 1, 2, 3, 4, 5, 5, 5, 5],
  );
  assert.ok(s.every((x) => x.view.hand === 0));
});
