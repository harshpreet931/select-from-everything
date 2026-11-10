// stable, diff-friendly json for traces, and a volatile-aware comparison for --check / --twice.

/** small things stay on one line, big ones get one child per line. keys keep insertion order. */
export function stringify(v, indent = "") {
  const flat = JSON.stringify(v);
  if (flat === undefined) return "null";
  if (flat.length + indent.length <= 110 || v === null || typeof v !== "object") return flat;
  const next = `${indent} `;
  if (Array.isArray(v)) return `[\n${v.map((x) => next + stringify(x, next)).join(",\n")}\n${indent}]`;
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  return `{\n${entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${stringify(x, next)}`).join(",\n")}\n${indent}}`;
}

/** what --check and --twice compare: the trace minus anything flagged volatile */
export function masked(trace) {
  const t = structuredClone(trace);
  for (const s of t.steps ?? []) {
    if (s.wal?.records) s.wal.records = s.wal.records.filter((r) => !r.volatile);
    if (Array.isArray(s.log)) s.log = s.log.map(maskLogLine);
  }
  return t;
}

/** VACUUM VERBOSE timing noise: kept readable in the json ("avg read rate: 0.000 MB/s"), ignored
 *  when comparing. rates and the tab-indented "system usage" line vary when pages get dirtied */
export function maskLogLine(l) {
  if (typeof l !== "string") return l;
  return l.replace(/avg (read|write) rate: [\d.]+ MB\/s/g, "avg $1 rate: <r> MB/s").replace(/^(\s*)system usage: .*$/, "$1system usage: <masked>");
}

/** paths where a and b differ, at most `max` of them */
export function diffPaths(a, b, max = 20) {
  const out = [];
  const walk = (x, y, p) => {
    if (out.length >= max) return;
    if (x === y) return;
    if (typeof x !== typeof y || x === null || y === null || typeof x !== "object" || Array.isArray(x) !== Array.isArray(y)) {
      out.push({ path: p || "(root)", a: x, b: y });
      return;
    }
    if (Array.isArray(x)) {
      if (x.length !== y.length) out.push({ path: `${p}.length`, a: x.length, b: y.length });
      for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], `${p}[${i}]`);
      return;
    }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) walk(x[k], y[k], p ? `${p}.${k}` : k);
  };
  walk(a, b, "");
  return out;
}

export const short = (v) => {
  const s = JSON.stringify(v);
  return s === undefined ? "undefined" : s.length > 90 ? `${s.slice(0, 90)}…` : s;
};
