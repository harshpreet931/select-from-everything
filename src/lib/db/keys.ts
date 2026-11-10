// index keys as bt_page_items prints them, compared the way a scan bound compares them.
// pure, so server code and tests can use it (BTree highlights ranges with it).

/** the parts of a key: "(1, 2)" → ["1", "2"], "Ana Lima" → ["Ana Lima"], 7 → ["7"] */
export const keyParts = (k: string | number): string[] => {
  const s = String(k);
  const m = /^\((.*)\)$/.exec(s);
  return m ? m[1].split(/,\s*/) : [s];
};
const cmpPart = (a: string, b: string) => {
  const x = Number(a);
  const y = Number(b);
  if (a.trim() !== "" && b.trim() !== "" && !Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return a < b ? -1 : a > b ? 1 : 0;
};
/**
 * compare two index keys the way a scan bound does: column by column, numbers as numbers,
 * text as text, and a shorter key matches as a prefix ([1, 1] selects every (1, …) key).
 */
export function cmpKey(a: string | number, b: string | number): number {
  const p = keyParts(a);
  const q = keyParts(b);
  for (let i = 0; i < Math.min(p.length, q.length); i++) {
    const c = cmpPart(p[i], q[i]);
    if (c) return c;
  }
  return 0;
}

