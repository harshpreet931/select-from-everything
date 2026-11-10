import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { CONFLICTS, LOCK_MODES, modeIndex } from "../locks.ts";
// @ts-ignore
import { fixture } from "./fixture.ts";

test("the conflict matrix LockTable draws is the one postgres really enforces", () => {
  const f = fixture<{ modes: string[]; conflicts: boolean[][] }>("locks.json");
  assert.deepEqual([...LOCK_MODES], f.modes);
  assert.deepEqual(CONFLICTS, f.conflicts);
});

test("pg_locks mode names map onto the table", () => {
  assert.equal(modeIndex("AccessShareLock"), 0);
  assert.equal(modeIndex("ShareUpdateExclusiveLock"), 3);
  assert.equal(modeIndex("ACCESS EXCLUSIVE"), 7);
  assert.equal(modeIndex("nonsense"), -1);
});
