// the table-level lock modes and which ones conflict, as postgres 18.6 really enforces them
// (measured in fixtures/locks.json: each mode held in a prepared transaction, every mode
// requested with NOWAIT; sim/locks.test.ts checks this table against it). pure, so server
// components can use it; LockTable draws it.

export const LOCK_MODES = ["ACCESS SHARE", "ROW SHARE", "ROW EXCLUSIVE", "SHARE UPDATE EXCLUSIVE", "SHARE", "SHARE ROW EXCLUSIVE", "EXCLUSIVE", "ACCESS EXCLUSIVE"] as const;

/** CONFLICTS[held][wanted] */
export const CONFLICTS: boolean[][] = [
  [false, false, false, false, false, false, false, true],
  [false, false, false, false, false, false, true, true],
  [false, false, false, false, true, true, true, true],
  [false, false, false, true, true, true, true, true],
  [false, false, true, true, false, true, true, true],
  [false, false, true, true, true, true, true, true],
  [false, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true],
];

/** "AccessShareLock" or "ACCESS SHARE" → index into LOCK_MODES (-1 if unknown) */
export function modeIndex(m: string): number {
  const norm = m
    .replace(/Lock$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toUpperCase()
    .trim();
  return LOCK_MODES.indexOf(norm as (typeof LOCK_MODES)[number]);
}
