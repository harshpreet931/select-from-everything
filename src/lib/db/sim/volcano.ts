// model of the executor's pull loop (ExecProcNode), simplified: every node is an iterator,
// the parent calls next() on its child and gets one row back or "no more rows". a small
// set of nodes: scans with a filter, Limit, Sort, Aggregate (plain / hashed / grouped, with
// a HAVING filter), Hash + Hash Join, Nested Loop, Materialize, Result. predicates are
// data ([col, op, value]), not sql. checked in volcano.test.ts: per-node row counts equal
// EXPLAIN ANALYZE's actual rows on postgres 18.6 for the captured plans.

import type { PlanNode, Pred, Table } from "../views";

export type VVal = string | number | boolean | null;
export type VRow = Record<string, VVal>;
export type VEvent = { kind: "call" | "return" | "eof" | "build"; node: string; parent?: string; row?: VRow; n?: number };
export type VolcanoRun = {
  events: VEvent[];
  counts: Record<string, { rows: number; removed: number; loops: number }>;
  output: VRow[];
};

const num = (v: VVal) => (typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN);

/** a joined row: the outer side keeps the bare names (o.id stays id); an inner column with the
 *  same name and a different value is kept as "inner.<name>" instead of overwriting it */
export function joinRow(o: VRow, r: VRow): VRow {
  const out: VRow = { ...o };
  for (const [k, v] of Object.entries(r)) {
    if (!(k in out)) out[k] = v;
    else if (out[k] !== v) out[`inner.${k}`] = v;
  }
  return out;
}

export function passes(p: Pred, r: VRow): boolean {
  const [col, op, val] = p;
  const v = r[col] ?? null;
  if (op === "is null") return v === null;
  if (op === "is not null") return v !== null;
  if (op === "true") return v === true || v === "t" || v === "true";
  if (op === "false") return v === false || v === "f" || v === "false";
  if (v === null || val === null || val === undefined) return false; // NULL compares to unknown
  const a = num(v);
  const b = num(val as VVal);
  const both = !Number.isNaN(a) && !Number.isNaN(b);
  const c = both ? a - b : String(v) < String(val) ? -1 : String(v) > String(val) ? 1 : 0;
  switch (op) {
    case "=":
      return c === 0;
    case "<>":
      return c !== 0;
    case "<":
      return c < 0;
    case "<=":
      return c <= 0;
    case ">":
      return c > 0;
    case ">=":
      return c >= 0;
  }
  return false;
}

export const predText = (p: Pred) => (p[1] === "true" ? p[0] : p[1] === "false" ? `NOT ${p[0]}` : p[1].startsWith("is") ? `${p[0]} ${p[1].toUpperCase()}` : `${p[0]} ${p[1]} ${p[2]}`);

export function tableRows(t: Table): VRow[] {
  const cols = t.columns.map((c) => (typeof c === "string" ? c : c.name));
  return t.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? null])));
}

interface It {
  next(): VRow | null;
  rescan(): void;
}

export function runVolcano(plan: PlanNode, tables: Record<string, Table>, o: { maxEvents?: number } = {}): VolcanoRun {
  const events: VEvent[] = [];
  const counts: VolcanoRun["counts"] = {};
  const max = o.maxEvents ?? 5000;
  const ev = (e: VEvent) => {
    if (events.length < max) events.push(e);
  };
  const cnt = (id: string) => (counts[id] ??= { rows: 0, removed: 0, loops: 0 });

  function build(n: PlanNode, parent?: string): It {
    const s = n.sim ?? {};
    const id = n.id;
    cnt(id).loops = 1;
    const op = n.op;
    const kids = n.kids.map((k) => build(k, id));
    const ret = (r: VRow) => {
      cnt(id).rows++;
      ev({ kind: "return", node: id, parent, row: r });
      return r;
    };
    const eof = () => {
      ev({ kind: "eof", node: id, parent });
      return null;
    };
    const call = () => ev({ kind: "call", node: id, parent });
    const pass = (r: VRow) => (s.where ?? []).every((p) => passes(p, r));
    const project = (r: VRow): VRow => (s.cols ? Object.fromEntries(s.cols.map((c) => [c, r[c] ?? null])) : r);

    if (/Scan$/.test(op) && !kids.length) {
      let rows = tableRows(tables[s.table ?? ""] ?? { columns: [], rows: [] });
      if (/Index/.test(op) && s.key) rows = [...rows].sort((a, b) => cmp(a[s.key!], b[s.key!]) * (s.desc ? -1 : 1));
      let i = 0;
      return {
        next() {
          call();
          while (i < rows.length) {
            const r = rows[i++];
            if (pass(r)) return ret(project(r));
            cnt(id).removed++;
          }
          return eof();
        },
        rescan() {
          i = 0;
          cnt(id).loops++;
        },
      };
    }
    if (op === "Limit") {
      let k = 0;
      return {
        next() {
          call();
          if (k >= (s.count ?? Infinity)) return eof();
          const r = kids[0].next();
          if (!r) return eof();
          k++;
          return ret(r);
        },
        rescan() {
          k = 0;
          kids[0].rescan();
        },
      };
    }
    if (op === "Sort" || op === "Materialize" || /Aggregate$/.test(op)) {
      let buf: VRow[] | null = null;
      let i = 0;
      const fill = () => {
        const got: VRow[] = [];
        for (let r = kids[0].next(); r; r = kids[0].next()) got.push(r);
        if (op === "Sort") return got.sort((a, b) => cmp(a[s.key!], b[s.key!]) * (s.desc ? -1 : 1));
        if (op === "Materialize") return got;
        // aggregate: groups in first-seen order (hashed), or by key (grouped)
        const groups = new Map<string, VRow[]>();
        for (const r of got) {
          const g = s.key ? JSON.stringify(r[s.key] ?? null) : "all";
          if (!groups.has(g)) groups.set(g, []);
          groups.get(g)!.push(r);
        }
        if (!s.key && !groups.size) groups.set("all", []);
        let out = [...groups.entries()].map(([g, rs]) => {
          const row: VRow = s.key ? { [s.key]: JSON.parse(g) } : {};
          for (const a of s.aggs ?? []) row[a.as] = agg(a.fn, a.col ? rs.map((r) => r[a.col!]) : rs.map(() => 1));
          return row;
        });
        if (op === "GroupAggregate") out = out.sort((a, b) => cmp(a[s.key!], b[s.key!]));
        const kept = out.filter(pass);
        cnt(id).removed += out.length - kept.length;
        return kept;
      };
      return {
        next() {
          call();
          if (!buf) {
            buf = fill();
            ev({ kind: "build", node: id, parent, n: buf.length });
          }
          if (i >= buf.length) return eof();
          return ret(buf[i++]);
        },
        rescan() {
          i = 0;
          if (op !== "Materialize") {
            buf = null;
            kids[0].rescan();
          }
          cnt(id).loops++;
        },
      };
    }
    if (op === "Hash") {
      // never returns rows through next(): the join asks it to build, then probes it
      let table: VRow[] | null = null;
      const it = {
        next() {
          call();
          if (!table) {
            table = [];
            for (let r = kids[0].next(); r; r = kids[0].next()) {
              table.push(r);
              cnt(id).rows++;
            }
            ev({ kind: "build", node: id, parent, n: table.length });
          }
          return eof();
        },
        rescan() {},
        rows: () => table ?? [],
      };
      return it;
    }
    if (op === "Hash Join" || op === "Merge Join" || op === "Nested Loop") {
      const [outerKey, innerKey] = s.on ?? ["", ""];
      const outer = kids[0];
      const inner = kids[1] as It & { rows?: () => VRow[] };
      let built = false;
      let queue: VRow[] = [];
      return {
        next() {
          call();
          if (op !== "Nested Loop" && !built) {
            inner.next(); // Hash builds (or Materialize/Sort drains) on the first call
            built = true;
          }
          for (;;) {
            if (queue.length) {
              const r = queue.shift()!;
              if (pass(r)) return ret(r);
              cnt(id).removed++;
              continue;
            }
            const o = outer.next();
            if (!o) return eof();
            let candidates: VRow[];
            if (op === "Nested Loop") {
              inner.rescan();
              candidates = [];
              for (let r = inner.next(); r; r = inner.next()) candidates.push(r);
            } else candidates = inner.rows ? inner.rows() : [];
            queue = candidates.filter((r) => o[outerKey] != null && r[innerKey] != null && String(o[outerKey]) === String(r[innerKey])).map((r) => project(joinRow(o, r)));
          }
        },
        rescan() {
          queue = [];
          outer.rescan();
        },
      };
    }
    // Result / Subquery Scan / anything else: pass rows through, filtered
    return {
      next() {
        call();
        for (let r = kids[0]?.next(); r; r = kids[0].next()) {
          if (pass(r)) return ret(project(r));
          cnt(id).removed++;
        }
        return eof();
      },
      rescan() {
        kids[0]?.rescan();
      },
    };
  }

  const root = build(plan);
  const output: VRow[] = [];
  for (let r = root.next(); r; r = root.next()) output.push(r);
  return { events, counts, output };
}

function cmp(a: VVal | undefined, b: VVal | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const x = num(a);
  const y = num(b);
  if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function agg(fn: "count" | "sum" | "avg" | "min" | "max", vs: VVal[]): VVal {
  const xs = vs.filter((v) => v !== null);
  if (fn === "count") return xs.length;
  const ns = xs.map(num).filter((n) => !Number.isNaN(n));
  if (!ns.length) return null;
  if (fn === "sum") return round(ns.reduce((a, b) => a + b, 0));
  if (fn === "avg") return round(ns.reduce((a, b) => a + b, 0) / ns.length);
  if (fn === "min") return Math.min(...ns);
  return Math.max(...ns);
}

const round = (x: number) => Math.round(x * 100) / 100;

/** attach volcano specs to a plan in pre-order (root first, then kids left to right) */
export function withSim(plan: PlanNode, specs: (PlanNode["sim"] | undefined)[]): PlanNode {
  let i = 0;
  const walk = (n: PlanNode): PlanNode => {
    const sim = specs[i++];
    return { ...n, ...(sim ? { sim } : {}), kids: n.kids.map(walk) };
  };
  return walk(plan);
}
