// model of the postgres buffer pool's replacement, simplified: one backend, no bgwriter, no
// checkpointer, every pin released right after the request. the sweep is StrategyGetBuffer
// (src/backend/storage/buffer/freelist.c): use a never-used frame if there is one, otherwise
// move the clock hand, and on each unpinned frame with usage_count > 0 decrement it and move
// on; the first unpinned frame with usage 0 is the victim. a hit bumps usage_count up to 5
// (BM_MAX_USAGE_COUNT). a bulk read can use a small ring of its own frames (BAS_BULKREAD),
// reusing a ring frame only if nobody else bumped it past 1. lru and fifo are the textbook
// policies, for comparison. tested for invariants in clock.test.ts; captions say "model".

import type { PoolFrame, PoolView, Stepped } from "../views";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { rng } from "./rand.ts";

export type Policy = "clock-sweep" | "lru" | "fifo";
export type Req = { rel: string; block: number; write?: boolean; scan?: boolean };
export type PoolOpts = { frames: number; policy: Policy; ring?: number; maxUsage?: number };

const label = (r: { rel: string; block: number }) => `${r.rel}·${r.block}`;

export function poolSteps(reqs: Req[], o: PoolOpts): Stepped<PoolView>[] {
  const max = o.maxUsage ?? 5;
  const frames: PoolFrame[] = Array.from({ length: o.frames }, (_, id) => ({ id, dirty: false, pins: 0, usage: 0 }));
  const loadedAt = new Array<number>(o.frames).fill(-1);
  const usedAt = new Array<number>(o.frames).fill(-1);
  const ring: number[] = [];
  let ringPos = 0;
  // only clock sweep has a hand; lru and fifo draw none (-1)
  let hand = o.policy === "clock-sweep" ? 0 : -1;
  const stats = { hit: 0, read: 0, evicted: 0, written: 0 };
  const steps: Stepped<PoolView>[] = [];
  const snap = (extra: Partial<PoolView>, note: string, lab: string) =>
    steps.push({ view: { frames: frames.map((f) => ({ ...f, page: f.page && { ...f.page }, ring: ring.includes(f.id) || undefined })), hand, stats: { ...stats }, table: true, ...extra }, note, label: lab });

  snap({}, `${o.frames} empty frames. every page anyone reads or writes has to come through here first.`, "start");

  const find = (r: Req) => frames.findIndex((f) => f.page && f.page.rel === r.rel && f.page.block === r.block);

  reqs.forEach((r, t) => {
    const at = find(r);
    if (at >= 0) {
      const f = frames[at];
      const before = f.usage;
      f.usage = Math.min(max, f.usage + 1);
      if (r.write) f.dirty = true;
      usedAt[at] = t;
      stats.hit++;
      snap(
        { req: { rel: r.rel, block: r.block }, hit: true, victim: at },
        `${label(r)} is already in frame ${at}: a hit, no I/O. usage_count ${before === f.usage ? `stays at the cap, ${max}` : `${before} → ${f.usage}`}.${r.write ? " the change makes the page dirty: it now differs from disk." : ""}`,
        `${r.write ? "write" : "read"} ${label(r)}`,
      );
      return;
    }
    // a miss: pick a frame
    let victim = -1;
    const swept: number[] = [];
    let how = "";
    const empty = frames.findIndex((f) => !f.page);
    const ringFull = !!(r.scan && o.ring && ring.length >= o.ring);
    const slot = ringFull ? ringPos % ring.length : -1;
    if (ringFull) {
      const cand = ring[slot];
      ringPos++;
      if (frames[cand].pins === 0 && frames[cand].usage <= 1) {
        victim = cand;
        how = `the scan reuses its own ring frame ${cand} instead of taking one from everyone else.`;
      }
    }
    if (victim < 0 && empty >= 0) {
      victim = empty;
      how = `frame ${empty} has never been used, so no eviction is needed.`;
    }
    if (victim < 0 && o.policy === "clock-sweep") {
      for (let guard = 0; guard < frames.length * (max + 2); guard++) {
        const f = frames[hand];
        const i = hand;
        hand = (hand + 1) % frames.length;
        if (f.pins > 0) continue;
        if (f.usage > 0) {
          f.usage--;
          swept.push(i);
          continue;
        }
        victim = i;
        break;
      }
      how = swept.length
        ? `the clock hand sweeps: ${swept.length} frame${swept.length > 1 ? "s" : ""} had usage left, each loses 1 and survives this lap. frame ${victim} is at 0: the victim.`
        : `the clock hand stops at frame ${victim}: usage 0, the victim.`;
    }
    if (victim < 0 && o.policy === "lru") {
      victim = frames.reduce((b, f, i) => (f.pins === 0 && (b < 0 || usedAt[i] < usedAt[b]) ? i : b), -1);
      how = `lru evicts the page untouched the longest: frame ${victim}.`;
    }
    if (victim < 0 && o.policy === "fifo") {
      victim = frames.reduce((b, f, i) => (f.pins === 0 && (b < 0 || loadedAt[i] < loadedAt[b]) ? i : b), -1);
      how = `fifo evicts the page loaded first: frame ${victim}, no matter how often it was used.`;
    }
    const f = frames[victim];
    let out = "";
    if (f.page) {
      stats.evicted++;
      out = ` out goes ${label(f.page)}${f.dirty ? ", which is dirty, so it is written back first" : ""}.`;
      if (f.dirty) stats.written++;
    }
    f.page = { rel: r.rel, block: r.block };
    f.usage = 1;
    f.dirty = !!r.write;
    loadedAt[victim] = t;
    usedAt[victim] = t;
    stats.read++;
    if (r.scan && o.ring && !ring.includes(victim)) {
      if (!ringFull) ring.push(victim);
      else ring[slot] = victim;
    }
    snap({ req: { rel: r.rel, block: r.block }, hit: false, victim, swept }, `${label(r)} isn't here: a read from disk. ${how}${out}`, `${r.write ? "write" : "read"} ${label(r)}`);
  });
  return steps;
}

/** request streams for the lab */
export function workload(kind: "hot+scan" | "seqscan" | "random" | number[], frames: number): Req[] {
  if (Array.isArray(kind)) return kind.map((b) => ({ rel: "t", block: b }));
  if (kind === "seqscan") return Array.from({ length: frames + 4 }, (_, b) => ({ rel: "big", block: b, scan: true }));
  if (kind === "random") {
    const r = rng(7);
    // skewed: a few blocks get most of the traffic
    return Array.from({ length: frames * 3 }, () => {
      const x = r();
      const b = x < 0.6 ? Math.floor(r() * 3) : Math.floor(r() * frames * 2);
      return { rel: "t", block: b, write: r() < 0.2 };
    });
  }
  // hot+scan: a small hot set used over and over, then one big sequential scan, then the hot set again
  const hot = Math.max(2, Math.floor(frames / 3));
  const out: Req[] = [];
  for (let lap = 0; lap < 3; lap++) for (let b = 0; b < hot; b++) out.push({ rel: "accounts", block: b, write: lap === 1 && b === 0 });
  for (let b = 0; b < frames + 2; b++) out.push({ rel: "events", block: b, scan: true });
  for (let b = 0; b < hot; b++) out.push({ rel: "accounts", block: b });
  return out;
}
