// a small line diff (longest common subsequence), printed like `diff -u` with a few lines of
// context. enough for "the golden says this, the engine says that".

/**
 * @param {string} a expected
 * @param {string} b actual
 * @param {{ context?: number; color?: boolean; maxLines?: number }} [o]
 */
export function unifiedDiff(a, b, o = {}) {
  const ctx = o.context ?? 2;
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length;
  const m = B.length;
  // too big for the quadratic table: show both ends instead
  if (n * m > 4_000_000) return [`--- golden (${n} lines)`, `+++ actual (${m} lines)`, "(too long to diff line by line)"].join("\n");
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  /** @type {[" " | "-" | "+", string][]} */
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) (ops.push([" ", A[i]]), i++, j++);
    else if (L[i + 1][j] >= L[i][j + 1]) ops.push(["-", A[i++]]);
    else ops.push(["+", B[j++]]);
  }
  while (i < n) ops.push(["-", A[i++]]);
  while (j < m) ops.push(["+", B[j++]]);

  const red = (s) => (o.color ? `\x1b[31m${s}\x1b[0m` : s);
  const green = (s) => (o.color ? `\x1b[32m${s}\x1b[0m` : s);
  const out = ["--- golden", "+++ actual"];
  let lastShown = -1;
  for (let k = 0; k < ops.length; k++) {
    if (ops[k][0] === " ") continue;
    const from = Math.max(lastShown + 1, k - ctx);
    if (lastShown >= 0 && from > lastShown + 1) out.push("@@");
    for (let x = from; x < k; x++) out.push(` ${ops[x][1]}`);
    let end = k;
    while (end < ops.length && (ops[end][0] !== " " || ops.slice(end, end + ctx * 2 + 1).some((op) => op[0] !== " "))) {
      if (end - k > 400) break;
      end++;
    }
    for (let x = k; x < Math.min(ops.length, end + ctx); x++) {
      const [t, s] = ops[x];
      out.push(t === "-" ? red(`-${s}`) : t === "+" ? green(`+${s}`) : ` ${s}`);
    }
    lastShown = Math.min(ops.length, end + ctx) - 1;
    k = lastShown;
  }
  const max = o.maxLines ?? 80;
  if (out.length > max) return [...out.slice(0, max), `… ${out.length - max} more lines`].join("\n");
  return out.join("\n");
}
