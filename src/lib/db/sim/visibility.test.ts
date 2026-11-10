import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { visible, removable, freshReader, parseSnap, snapText } from "../visibility.ts";
// @ts-ignore
import { fixture } from "./fixture.ts";
import type { Page, Snap, XactStatus } from "../views";

type VisFix = { snap: Snap; me: number; xact: Record<string, XactStatus>; page: Page; visible: [number, number][] };

test("predicted visible ctids equal the rows a real repeatable read session reads", () => {
  const f = fixture<VisFix>("visibility.json");
  const xact = Object.fromEntries(Object.entries(f.xact).map(([k, v]) => [Number(k), v]));
  const got = f.page.tuples
    .filter((t) => visible(t, xact, { snap: f.snap, me: f.me }).visible)
    .map((t) => `(${f.page.block},${t.lp})`)
    .sort();
  const want = f.visible.map(([b, o]) => `(${b},${o})`).sort();
  assert.deepEqual(got, want);
});

test("every rule fires at least once in the fixture", () => {
  const f = fixture<VisFix>("visibility.json");
  const xact = Object.fromEntries(Object.entries(f.xact).map(([k, v]) => [Number(k), v]));
  const rules = new Set(f.page.tuples.map((t) => visible(t, xact, { snap: f.snap, me: f.me }).rule));
  for (const r of [1, 2, 3, 4, 5, 6, 7, 8]) assert.ok(rules.has(r), `rule ${r} never fired`);
});

test("rules 3 and 7 say 'hadn't started' at or past xmax, 'still running' only for xip", () => {
  const f = fixture<VisFix>("visibility.json");
  const xact = Object.fromEntries(Object.entries(f.xact).map(([k, v]) => [Number(k), v]));
  const at = (lp: number) => visible(f.page.tuples.find((t) => t.lp === lp)!, xact, { snap: f.snap, me: f.me });
  // the fixture's snapshot is 761:761: (the prepared xids 761 and 762 sit at or past xmax)
  const r3 = at(9); // inserted by prepared xid 761
  assert.equal(r3.rule, 3);
  assert.match(r3.why, /hadn't started/);
  assert.doesNotMatch(r3.why, /still running/);
  const r7 = at(6); // deleted by prepared xid 762
  assert.equal(r7.rule, 7);
  assert.match(r7.why, /hadn't started/);
  assert.doesNotMatch(r7.why, /still running/);
  // an xid in xip really was running
  const snap = { xmin: 100, xmax: 105, xip: [102] };
  const ins = visible({ lpFlags: "normal", xmin: 102, xmax: 0, infomask: 0 }, { 102: "committed" }, { snap });
  assert.equal(ins.rule, 3);
  assert.match(ins.why, /still running/);
  const del = visible({ lpFlags: "normal", xmin: 90, xmax: 102, infomask: 0x0100 }, { 90: "committed", 102: "committed" }, { snap });
  assert.equal(del.rule, 7);
  assert.match(del.why, /still running/);
});

test("hint bits stand in for clog when an xid isn't listed", () => {
  const t = { lpFlags: "normal" as const, xmin: 900, xmax: 0, infomask: 0x0100 | 0x0800 };
  assert.equal(visible(t, {}, { snap: { xmin: 950, xmax: 950, xip: [] } }).visible, true);
});

test("removable needs a committed deleter older than the horizon", () => {
  const t = { lpFlags: "normal" as const, xmin: 10, xmax: 20, infomask: 0 };
  const xact: Record<number, XactStatus> = { 10: "committed", 20: "committed" };
  assert.equal(removable(t, xact, 21), true);
  assert.equal(removable(t, xact, 20), false);
  assert.equal(removable(t, { ...xact, 20: "in progress" }, 99), false);
  assert.equal(removable({ ...t, xmax: 0 }, { 10: "aborted" }, 0), true);
});

test("snapshots round-trip and a fresh reader sees every committed xid", () => {
  assert.deepEqual(parseSnap("754:756:754"), { xmin: 754, xmax: 756, xip: [754] });
  assert.equal(snapText({ xmin: 754, xmax: 756, xip: [754] }), "754:756:754");
  const r = freshReader({ 754: "committed", 755: "in progress" });
  assert.deepEqual(r.snap, { xmin: 755, xmax: 756, xip: [755] });
});
