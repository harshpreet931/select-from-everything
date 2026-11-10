// which rows a folded table draws. pure, so src/lib/db/sim/fold.test.ts can check it.
//
// marked rows (a ghost the step just removed, a focus row) come first: up to maxRows of them
// are drawn, so a clause that removes a hundred rows doesn't make the table a hundred rows
// tall (the rest are counted in the "… n more" lines). whatever room is left goes to the first
// unmarked rows. a hidden run of a single row isn't worth a "… 1 more" line (same height), so
// it's drawn instead.

export function foldRows(n: number, maxRows: number | undefined, marked: Iterable<number> = []): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  if (!maxRows || n <= maxRows + 1) return all;
  const m = new Set([...new Set([...marked])].filter((i) => Number.isInteger(i) && i >= 0 && i < n).sort((a, b) => a - b).slice(0, maxRows));
  let budget = Math.max(1, maxRows - m.size);
  const keep = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (m.has(i)) keep.add(i);
    else if (budget > 0) {
      keep.add(i);
      budget--;
    }
  }
  // fill single-row holes (a gap line would take the same room)
  for (let i = 0; i < n; i++) if (!keep.has(i) && (i === 0 || keep.has(i - 1)) && (i === n - 1 || keep.has(i + 1))) keep.add(i);
  return all.filter((i) => keep.has(i));
}

/** the hidden runs: `at` is the visible row they sit before (n for the end), `count` how many */
export function foldGaps(n: number, visible: number[]): { at: number; count: number }[] {
  const out: { at: number; count: number }[] = [];
  let prev = -1;
  for (const i of [...visible, n]) {
    if (i - prev > 1) out.push({ at: i, count: i - prev - 1 });
    prev = i;
  }
  return out;
}
