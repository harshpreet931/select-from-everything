// model of the four join algorithms, simplified: tiny tables in memory, one equality key,
// work_mem counted in rows instead of bytes, no parallelism. the results are exact SQL
// semantics (NULL never equals anything), checked in join.test.ts against real postgres 18.6
// output for inner, left, right, full, semi and anti joins. counters are the model's.

// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { hashUint32 } from "./hash.ts";

export type JVal = string | number | boolean | null;
export type JRow = JVal[];
export type JTable = { name: string; columns: string[]; rows: JRow[] };
export type JoinAlgo = "nested-loop" | "index-nl" | "hash" | "merge";
export type JoinKind = "inner" | "left" | "semi" | "anti";
export type LogicalKind = "inner" | "left" | "right" | "full" | "semi" | "anti";

export type Counters = { comparisons: number; read: number; memory: number; batches: number };

export type JoinStep = {
  phase: "build" | "sort" | "probe" | "scan" | "merge" | "done";
  /** row index into the left table as drawn (the original order) */
  li?: number;
  ri?: number;
  /** comparison outcome of li vs ri */
  cmp?: boolean;
  bucket?: number;
  out: number;
  note: string;
  c: Counters;
};

export type JoinRun = {
  algo: JoinAlgo;
  kind: JoinKind;
  steps: JoinStep[];
  output: JRow[];
  /** where each output row came from: [li, ri | -1] */
  from: [number, number][];
  /** hash: right row indexes per bucket */
  buckets?: number[][];
  /** merge: both sides in sorted order */
  sortedL?: number[];
  sortedR?: number[];
  columns: string[];
};

const eq = (a: JVal, b: JVal) => a !== null && b !== null && String(a) === String(b);

function cmpVal(a: JVal, b: JVal): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // NULLS LAST
  if (b === null) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** hashint4 for integers (what postgres uses for int4 keys), a string hash otherwise */
/** a stable top-down merge sort with a deterministic number of comparisons on every engine */
export function mergeSort<T>(xs: T[], cmp: (a: T, b: T) => number): T[] {
  if (xs.length <= 1) return xs.slice();
  const mid = xs.length >> 1;
  const a = mergeSort(xs.slice(0, mid), cmp);
  const b = mergeSort(xs.slice(mid), cmp);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) out.push(cmp(a[i], b[j]) <= 0 ? a[i++] : b[j++]);
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

export function keyHash(v: JVal): number {
  if (typeof v === "number" && Number.isInteger(v)) return hashUint32(v);
  let h = 0;
  for (const ch of String(v)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return hashUint32(h);
}

const fmtRow = (r: JRow) => r.map((v) => (v === null ? "null" : String(v))).join(", ");

export function runJoin(left: JTable, right: JTable, on: [string, string], algo: JoinAlgo, kind: JoinKind, o: { workMem?: number } = {}): JoinRun {
  const lk = left.columns.indexOf(on[0]);
  const rk = right.columns.indexOf(on[1]);
  const L = left.rows;
  const R = right.rows;
  const nullR = R.length ? R[0].map(() => null) : right.columns.map(() => null);
  const c: Counters = { comparisons: 0, read: 0, memory: 0, batches: 1 };
  const steps: JoinStep[] = [];
  const output: JRow[] = [];
  const from: [number, number][] = [];
  const push = (s: Omit<JoinStep, "out" | "c">) => steps.push({ ...s, out: output.length, c: { ...c } });
  const emit = (li: number, ri: number) => {
    if (kind === "semi" || kind === "anti") output.push([...L[li]]);
    else output.push([...L[li], ...(ri >= 0 ? R[ri] : nullR)]);
    from.push([li, ri]);
  };
  const columns = kind === "semi" || kind === "anti" ? [...left.columns] : [...left.columns, ...right.columns.map((x) => (left.columns.includes(x) ? `${right.name}.${x}` : x))];
  const kl = (i: number) => L[i][lk];
  const kr = (j: number) => R[j][rk];
  const run: JoinRun = { algo, kind, steps, output, from, columns };

  // what to do with a left row once we know whether it matched
  const finish = (i: number, matched: boolean) => {
    if (!matched && kind === "left") {
      emit(i, -1);
      push({ phase: "probe", li: i, note: `${left.name} row (${fmtRow(L[i])}) found no match: a LEFT JOIN keeps it, padded with NULLs.` });
    }
    if (!matched && kind === "anti") {
      emit(i, -1);
      push({ phase: "probe", li: i, note: `no match for (${fmtRow(L[i])}): NOT EXISTS keeps it.` });
    }
  };

  if (algo === "nested-loop") {
    push({ phase: "scan", note: `for each ${left.name} row, scan all of ${right.name}. no index, no memory, just two loops.` });
    for (let i = 0; i < L.length; i++) {
      c.read++;
      let matched = false;
      for (let j = 0; j < R.length; j++) {
        c.read++;
        c.comparisons++;
        const hit = eq(kl(i), kr(j));
        if (hit && kind !== "anti") emit(i, j);
        push({
          phase: "probe",
          li: i,
          ri: j,
          cmp: hit,
          note: hit ? `${kl(i)} = ${kr(j)}: a match${kind === "semi" ? ", and one is enough for a semi join" : kind === "anti" ? ", so this row is out" : ""}.` : `${kl(i) ?? "NULL"} vs ${kr(j) ?? "NULL"}: no.${kl(i) === null || kr(j) === null ? " NULL never equals anything, not even NULL." : ""}`,
        });
        if (hit) matched = true;
        if (hit && (kind === "semi" || kind === "anti")) break;
      }
      finish(i, matched);
    }
  } else if (algo === "index-nl") {
    const idx = R.map((_, j) => j)
      .filter((j) => kr(j) !== null)
      .sort((a, b) => cmpVal(kr(a), kr(b)));
    push({ phase: "scan", note: `an index on ${right.name}.${on[1]} (sorted: ${idx.map((j) => kr(j)).join(", ")}). each ${left.name} row is one index lookup, not a scan.` });
    for (let i = 0; i < L.length; i++) {
      c.read++;
      const k = kl(i);
      let matched = false;
      if (k === null) {
        push({ phase: "probe", li: i, cmp: false, note: `${left.name}.${on[0]} is NULL: there is nothing to look up.` });
      } else {
        // binary search, counting comparisons
        let lo = 0;
        let hi = idx.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          c.comparisons++;
          if (cmpVal(kr(idx[mid]), k) < 0) lo = mid + 1;
          else hi = mid;
        }
        const hits: number[] = [];
        for (let p = lo; p < idx.length && eq(kr(idx[p]), k); p++) hits.push(idx[p]);
        c.comparisons++;
        if (!hits.length) push({ phase: "probe", li: i, cmp: false, note: `look up ${k}: ${Math.max(1, Math.ceil(Math.log2(idx.length + 1)))} comparisons down the index, no entry.` });
        for (const j of hits) {
          c.read++;
          if (kind !== "anti") emit(i, j);
          push({ phase: "probe", li: i, ri: j, cmp: true, note: `look up ${k}: the index points straight at ${right.name} row (${fmtRow(R[j])}).` });
          matched = true;
          if (kind === "semi" || kind === "anti") break;
        }
      }
      finish(i, matched);
    }
  } else if (algo === "hash") {
    const nb = Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, R.length))));
    const buckets: number[][] = Array.from({ length: nb }, () => []);
    run.buckets = buckets;
    const wm = o.workMem ?? Infinity;
    c.batches = R.length > wm ? 2 ** Math.ceil(Math.log2(R.length / wm)) : 1;
    push({
      phase: "build",
      note: `build: read ${right.name} once and put every row in a hash table keyed on ${on[1]}.${c.batches > 1 ? ` it doesn't fit in work_mem (${wm} rows), so it splits into ${c.batches} batches: the ones not in memory go to temp files and get joined later.` : ""}`,
    });
    for (let j = 0; j < R.length; j++) {
      c.read++;
      if (kr(j) === null) {
        push({ phase: "build", ri: j, note: `(${fmtRow(R[j])}) has a NULL key: it can never match, so it isn't hashed at all.` });
        continue;
      }
      const b = keyHash(kr(j)) % nb;
      buckets[b].push(j);
      c.memory = Math.min(buckets.reduce((s, x) => s + x.length, 0), wm);
      push({ phase: "build", ri: j, bucket: b, note: `hash(${kr(j)}) → bucket ${b}.` });
    }
    if (c.batches > 1) c.read += R.length + L.length; // spilled rows written and read back once
    push({ phase: "probe", note: `probe: now stream ${left.name}, hash each key, and only compare against that one bucket.` });
    for (let i = 0; i < L.length; i++) {
      c.read++;
      const k = kl(i);
      let matched = false;
      if (k === null) push({ phase: "probe", li: i, cmp: false, note: `NULL key: no bucket to look in.` });
      else {
        const b = keyHash(k) % nb;
        if (!buckets[b].length) push({ phase: "probe", li: i, bucket: b, cmp: false, note: `hash(${k}) → bucket ${b}: empty. zero comparisons.` });
        for (const j of buckets[b]) {
          c.comparisons++;
          const hit = eq(k, kr(j));
          if (hit && kind !== "anti") emit(i, j);
          push({ phase: "probe", li: i, ri: j, bucket: b, cmp: hit, note: hit ? `bucket ${b}: ${k} = ${kr(j)}, a match.` : `bucket ${b}: ${kr(j)} landed here too (a collision), but it's not ${k}.` });
          if (hit) matched = true;
          if (hit && (kind === "semi" || kind === "anti")) break;
        }
      }
      finish(i, matched);
    }
  } else {
    let sc = 0;
    const by = (key: (i: number) => JVal) => (a: number, b: number) => (sc++, cmpVal(key(a), key(b)));
    // our own merge sort: Array.prototype.sort's comparison count differs between engines (node vs
    // chrome), which made the server and client renders disagree (a hydration mismatch)
    const sl = mergeSort(L.map((_, i) => i), by(kl));
    const sr = mergeSort(R.map((_, j) => j), by(kr));
    c.comparisons += sc;
    c.read += L.length + R.length;
    run.sortedL = sl;
    run.sortedR = sr;
    push({ phase: "sort", note: `merge join needs both inputs sorted on the key. sorting them cost ${sc} comparisons (an index or an ORDER BY below could hand them over sorted for free).` });
    let p = 0;
    let q = 0;
    while (p < sl.length) {
      const i = sl[p];
      const k = kl(i);
      if (k === null) {
        finish(i, false);
        p++;
        continue;
      }
      while (q < sr.length && kr(sr[q]) !== null && cmpVal(kr(sr[q]), k) < 0) {
        c.comparisons++;
        push({ phase: "merge", li: i, ri: sr[q], cmp: false, note: `${kr(sr[q])} < ${k}: advance ${right.name}.` });
        q++;
      }
      // all right rows equal to k, starting at the mark q
      let r = q;
      let matched = false;
      while (r < sr.length && eq(kr(sr[r]), k)) {
        c.comparisons++;
        if (kind !== "anti") emit(i, sr[r]);
        push({ phase: "merge", li: i, ri: sr[r], cmp: true, note: `${k} = ${kr(sr[r])}: a match.${r > q ? " (still in the run of equal keys)" : ""}` });
        matched = true;
        r++;
        if (kind === "semi" || kind === "anti") break;
      }
      if (!matched) {
        c.comparisons++;
        push({ phase: "merge", li: i, ri: q < sr.length ? sr[q] : undefined, cmp: false, note: q < sr.length ? `${k} < ${kr(sr[q]) ?? "NULL"}: advance ${left.name}.` : `${right.name} is used up.` });
      }
      finish(i, matched);
      // a duplicate key on the left rewinds the right side to the mark
      const next = sl[p + 1];
      if (next !== undefined && eq(kl(next), k)) {
        push({ phase: "merge", li: next, note: `the next ${left.name} row has the same key: rewind ${right.name} to the mark and walk the run again.` });
      } else q = r;
      p++;
    }
  }
  push({ phase: "done", note: `done: ${output.length} row${output.length === 1 ? "" : "s"}, ${c.comparisons} comparisons, ${c.read} rows read.` });
  return run;
}

/** the logical result: every pair, which ones match, and the NULL-padded leftovers */
export function logicalJoin(left: JTable, right: JTable, on: [string, string], kind: LogicalKind) {
  const lk = left.columns.indexOf(on[0]);
  const rk = right.columns.indexOf(on[1]);
  const match = left.rows.map((l) => right.rows.map((r) => eq(l[lk], r[rk])));
  const rows: { row: JRow; li: number; ri: number }[] = [];
  const nl = left.columns.map(() => null);
  const nr = right.columns.map(() => null);
  if (kind === "semi" || kind === "anti") {
    left.rows.forEach((l, i) => {
      if (match[i].some(Boolean) === (kind === "semi")) rows.push({ row: [...l], li: i, ri: -1 });
    });
    return { match, rows };
  }
  left.rows.forEach((l, i) => right.rows.forEach((r, j) => match[i][j] && rows.push({ row: [...l, ...r], li: i, ri: j })));
  if (kind === "left" || kind === "full") left.rows.forEach((l, i) => !match[i].some(Boolean) && rows.push({ row: [...l, ...nr], li: i, ri: -1 }));
  if (kind === "right" || kind === "full") right.rows.forEach((r, j) => !match.some((m) => m[j]) && rows.push({ row: [...nl, ...r], li: -1, ri: j }));
  return { match, rows };
}
