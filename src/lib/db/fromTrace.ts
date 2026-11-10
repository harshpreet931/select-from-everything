// adapters: a pgtrace capture (or a raw EXPLAIN json) → the views the primitives draw.
// pure functions, no react. display normalisation lives here, never in the capture:
// xid aliases ("754 (T1)"), LSN offsets from the trace's base, the session's own words.

import type { PgStep, PgTrace } from "./pgtrace";
import type {
  BTreeNode,
  BTreeView,
  ChainView,
  LockReq,
  Page,
  PlanNode,
  PoolView,
  SessionOp,
  SessionStep,
  Table,
  Tid,
  Tuple,
  WalView,
} from "./views";
// @ts-ignore -- node --test (strip-types) needs the .ts extension
import { freshReader, removable, visible } from "./visibility.ts";

/* ---- EXPLAIN (FORMAT JSON) ------------------------------------------------------- */

type J = Record<string, unknown> & { Plans?: J[] };

const AGG: Record<string, string> = { Hashed: "HashAggregate", Sorted: "GroupAggregate", Mixed: "MixedAggregate", Plain: "Aggregate" };

/** the op name the way text EXPLAIN prints it */
function opName(n: J): string {
  const t = String(n["Node Type"]);
  if (t === "Aggregate") return AGG[String(n["Strategy"])] ?? t;
  if (t === "ModifyTable") return String(n["Operation"] ?? t);
  if (t === "SetOp") return `${n["Strategy"] === "Hashed" ? "HashSetOp" : "SetOp"} ${String(n["Command"] ?? "")}`.trim();
  return t;
}

const DETAIL_KEYS = [
  "Index Cond",
  "Recheck Cond",
  "Hash Cond",
  "Merge Cond",
  "Join Filter",
  "Filter",
  "Group Key",
  "Sort Key",
  "Presorted Key",
  "One-Time Filter",
  "Sort Method",
  "Heap Fetches",
  "Index Searches",
];

/** the runtime lines text EXPLAIN ANALYZE prints for bitmap, hash, hash aggregate and memoize nodes, in its spelling */
function runtimeLines(n: J): string[] {
  const out: string[] = [];
  const kb = (v: unknown) => `${v}kB`;
  const was = (now: unknown, orig: unknown) => (orig != null && orig !== now ? `${now} (originally ${orig})` : String(now));
  // Gather / Gather Merge: text EXPLAIN prints these first, one line each
  if (n["Workers Planned"] != null) out.push(`Workers Planned: ${n["Workers Planned"]}`);
  if (n["Workers Launched"] != null) out.push(`Workers Launched: ${n["Workers Launched"]}`);
  // Append / MergeAppend after partition pruning: how many children the planner or executor dropped
  if (n["Subplans Removed"] != null && Number(n["Subplans Removed"]) > 0) out.push(`Subplans Removed: ${n["Subplans Removed"]}`);
  const exact = Number(n["Exact Heap Blocks"] ?? 0), lossy = Number(n["Lossy Heap Blocks"] ?? 0);
  if (exact || lossy) out.push(`Heap Blocks:${exact ? ` exact=${exact}` : ""}${lossy ? ` lossy=${lossy}` : ""}`);
  if (n["Hash Buckets"] != null)
    out.push(`Buckets: ${was(n["Hash Buckets"], n["Original Hash Buckets"])}  Batches: ${was(n["Hash Batches"], n["Original Hash Batches"])}  Memory Usage: ${kb(n["Peak Memory Usage"])}`);
  if (n["HashAgg Batches"] != null)
    out.push(
      [n["Planned Partitions"] ? `Planned Partitions: ${n["Planned Partitions"]}` : "", `Batches: ${n["HashAgg Batches"]}`, `Memory Usage: ${kb(n["Peak Memory Usage"])}`, n["Disk Usage"] ? `Disk Usage: ${kb(n["Disk Usage"])}` : ""]
        .filter(Boolean)
        .join("  "),
    );
  if (n["Cache Hits"] != null) {
    if (n["Cache Key"] != null) out.push(`Cache Key: ${n["Cache Key"]}`);
    if (n["Cache Mode"] != null) out.push(`Cache Mode: ${n["Cache Mode"]}`);
    out.push(`Hits: ${n["Cache Hits"]}  Misses: ${n["Cache Misses"]}  Evictions: ${n["Cache Evictions"]}  Overflows: ${n["Cache Overflows"]}  Memory Usage: ${kb(n["Peak Memory Usage"])}`);
  }
  return out;
}

const REMOVED_KEYS = ["Rows Removed by Filter", "Rows Removed by Join Filter", "Rows Removed by Index Recheck", "Rows Removed by Conflict Filter"];
/** per-loop averages can be fractional in postgres 18 (0.50); counts print like EXPLAIN prints them */
const fmtCount = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** EXPLAIN (FORMAT JSON) output, in any of its wrappings, → PlanNode */
export function fromExplainJson(json: unknown): PlanNode {
  let j = json as J | J[];
  if (Array.isArray(j)) j = j[0];
  if (j && typeof j === "object" && "QUERY PLAN" in j) return fromExplainJson((j as Record<string, unknown>)["QUERY PLAN"]);
  const root = (j as J).Plan ? ((j as J).Plan as J) : (j as J);
  const walk = (n: J, id: string): PlanNode => {
    const detail: string[] = [];
    const rel = n["Relation Name"] ? `on ${n["Relation Name"]}${n["Alias"] && n["Alias"] !== n["Relation Name"] ? ` ${n["Alias"]}` : ""}` : "";
    const idx = n["Index Name"] ? `using ${n["Index Name"]}` : "";
    const head = [idx, rel].filter(Boolean).join(" ");
    if (head) detail.push(head);
    for (const k of DETAIL_KEYS) {
      const v = n[k];
      if (v == null) continue;
      if (k === "Sort Method") detail.push(`Sort Method: ${v}${n["Sort Space Used"] != null ? `  ${n["Sort Space Type"] ?? "Memory"}: ${n["Sort Space Used"]}kB` : ""}`);
      else detail.push(`${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    }
    detail.push(...runtimeLines(n));
    // each "Rows Removed by ..." under its own name; zero counts dropped, as text EXPLAIN does
    for (const k of REMOVED_KEYS) {
      const v = Number(n[k] ?? 0);
      if (v > 0) detail.push(`${k}: ${fmtCount(v)}`);
    }
    const removed = n["Rows Removed by Filter"] ?? n["Rows Removed by Join Filter"];
    const hasActual = n["Actual Rows"] != null;
    const hasBuf = n["Shared Hit Blocks"] != null;
    return {
      id,
      op: opName(n),
      detail,
      est: { rows: Number(n["Plan Rows"] ?? 0), startup: Number(n["Startup Cost"] ?? 0), total: Number(n["Total Cost"] ?? 0), width: Number(n["Plan Width"] ?? 0) },
      ...(hasActual ? { actual: { rows: Number(n["Actual Rows"]), loops: Number(n["Actual Loops"] ?? 1) } } : {}),
      ...(hasBuf
        ? {
            buffers: {
              hit: Number(n["Shared Hit Blocks"] ?? 0),
              read: Number(n["Shared Read Blocks"] ?? 0),
              dirtied: Number(n["Shared Dirtied Blocks"] ?? 0),
              written: Number(n["Shared Written Blocks"] ?? 0),
            },
          }
        : {}),
      ...(removed != null ? { removed: Number(removed) } : {}),
      ...(n["Join Type"] ? { join: String(n["Join Type"]) } : {}),
      ...(n["Parent Relationship"] ? { parent: String(n["Parent Relationship"]) } : {}),
      ...(n["Subplan Name"] ? { subplan: String(n["Subplan Name"]) } : {}),
      ...(n["Disabled"] === true ? { disabled: true } : {}),
      kids: (n.Plans ?? []).map((c, i) => walk(c, `${id}.${i}`)),
    };
  };
  return walk(root, "0");
}

/** pre-order list of nodes */
export const planNodes = (p: PlanNode): PlanNode[] => [p, ...p.kids.flatMap(planNodes)];

// nodes that read their whole input before returning a row: whatever stops above them, they
// still ran their children to completion. (a Hash reports the rows it built, so it never
// "stops early" itself either.)
const BLOCKING = /^(Sort|Hash|HashAggregate|Aggregate|MixedAggregate|HashSetOp\b.*)$/;

/**
 * nodes that may not have run to completion, because something above stopped asking for rows:
 * a Limit, the inner side of a semi or anti join (one match is enough), either side of a
 * merge join (it stops when one input runs out), a SubPlan or InitPlan (EXISTS stops at the
 * first row, a scalar subquery at the second). postgres planned those expecting to stop early,
 * so a low actual row count there is not a misestimate. the stop passes down through
 * streaming nodes and ends at a blocking one (Sort, Hash, aggregates), which reads everything.
 */
export function stoppedEarly(plan: PlanNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: PlanNode, early: boolean) => {
    if (early && n.op !== "Hash") out.add(n.id);
    const blocking = BLOCKING.test(n.op);
    n.kids.forEach((k, i) => {
      let e = blocking ? false : early;
      if (n.op === "Limit") e = true;
      if (/Semi|Anti/.test(n.join ?? "") && i === 1) e = true;
      if (n.op === "Merge Join") e = true;
      if (k.parent === "SubPlan" || k.parent === "InitPlan") e = true;
      walk(k, e);
    });
  };
  walk(plan, false);
  return out;
}

/**
 * real misestimates: nodes that ran to completion (and ran at all) whose actual rows per loop
 * are off from the estimate per loop by `ratio` or more, either way. EXPLAIN already reports
 * both per loop (actual rows is the per-loop average), so they compare directly.
 */
export function misestimates(plan: PlanNode, ratio = 10): Map<string, number> {
  const early = stoppedEarly(plan);
  // under a bitmap heap scan whose bitmap went all lossy (always, for BRIN), the bitmap index
  // scan's "rows" are a page count guess (BRIN reports 10 per page), not rows
  const lossyKids = new Set<string>();
  for (const n of planNodes(plan)) {
    const hb = n.op.startsWith("Bitmap Heap Scan") ? n.detail?.find((d) => d.startsWith("Heap Blocks:")) : undefined;
    if (hb && /lossy=/.test(hb) && !/exact=/.test(hb)) for (const k of planNodes(n)) if (k !== n) lossyKids.add(k.id);
  }
  const out = new Map<string, number>();
  for (const n of planNodes(plan)) {
    if (!n.actual || !n.est || n.actual.loops === 0 || early.has(n.id) || lossyKids.has(n.id)) continue;
    const a = Math.max(1, n.actual.rows);
    const e = Math.max(1, n.est.rows);
    const r = Math.max(a / e, e / a);
    if (r >= ratio) out.set(n.id, r);
  }
  return out;
}

/* ---- steps, sessions, xids ---------------------------------------------------- */

/** xid → session name, from every step's xids probe ("754" → "T1") */
export function xidNames(trace: PgTrace): Record<number, string> {
  const out: Record<number, string> = {};
  for (const s of trace.steps) for (const [name, x] of Object.entries(s.xids ?? {})) if (x.xid) out[x.xid] = name;
  return out;
}

export const xidLabel = (x: number | undefined, names: Record<number, string>) => (!x ? "0" : names[x] ? `${x} (${names[x]})` : String(x));

/** what a statement printed, in one short line: "UPDATE 1", "100", "3 rows" */
export function outLine(r: PgStep["result"]): string | undefined {
  if (!r) return undefined;
  if (r.columns.length && r.data.length === 1 && r.columns.length === 1) {
    // a void result (pg_sleep) prints nothing; an empty string prints as '' like psql shows it
    if (r.columns[0].type === "void") return undefined;
    const v = r.data[0][0];
    return v === null ? "null" : v === "" ? "''" : v;
  }
  if (r.columns.length) return `${r.data.length} row${r.data.length === 1 ? "" : "s"}`;
  if (r.command === "INSERT") return `INSERT 0 ${r.rows ?? 0}`;
  if (/^(UPDATE|DELETE|MERGE|SELECT|COPY|FETCH|MOVE)$/.test(r.command)) return `${r.command} ${r.rows ?? 0}`;
  // BEGIN, COMMIT, VACUUM, CREATE ...: the tag only repeats the statement
  return undefined;
}

export function lockText(l: { mode: string; type: string; target: string }) {
  return `${l.mode} on ${l.type === "transactionid" ? `transaction ${l.target}` : l.type === "relation" ? l.target : `${l.type} ${l.target}`}`;
}

/** a trace as SessionLanes steps: ops per session, wake-ups, snapshots, locks, committed rows */
export function traceLanes(trace: PgTrace, table?: string): SessionStep[] {
  const idx = (s: string) => trace.sessions.indexOf(s);
  const rel = table ?? Object.keys(trace.rels).find((r) => trace.rels[r].kind === "table");
  return trace.steps.map((st) => {
    const ops: (SessionOp | null)[] = trace.sessions.map(() => null);
    const op: Exclude<SessionOp, string> = { sql: st.sql.trim() };
    // a safe-snapshot wait (READ ONLY DEFERRABLE) has no lock and no blocker pid
    if (st.status === "blocked" && st.blocked)
      op.wait = st.blocked.lock ? `waits for ${st.blocked.by.join(", ")}: ${lockText(st.blocked.lock)}` : st.blocked.by.length ? `waits for ${st.blocked.by.join(", ")}` : "waits";
    else if (st.status === "error" && st.error) op.error = { sqlstate: st.error.sqlstate, message: st.error.message };
    else op.out = outLine(st.result);
    if (st.session !== "obs" && idx(st.session) >= 0) ops[idx(st.session)] = op;
    for (const w of st.woke ?? []) {
      if (idx(w.session) < 0) continue;
      const orig = trace.steps[w.step];
      ops[idx(w.session)] = {
        sql: orig?.sql.trim() ?? "",
        woke: true,
        ...(w.error ? { error: { sqlstate: w.error.sqlstate, message: w.error.message } } : { out: outLine(w.result) }),
      };
    }
    const snaps: Record<string, NonNullable<SessionStep["snaps"]>[string]> = {};
    for (const [name, x] of Object.entries(st.xids ?? {})) snaps[name] = x.snap;
    const out: SessionStep = { ops, snaps, note: st.note };
    if (st.session === "obs") out.obs = op;
    // @crash / @restart: the whole server, not a session. a full-width row, muted, saying what happened
    if (st.session === "server") {
      const sql = st.sql.trim();
      const crashed = trace.steps.slice(0, trace.steps.indexOf(st)).reverse().find((x) => x.session === "server")?.sql.includes("immediate");
      const why = /-m\s+immediate/.test(sql) ? "the server crashes" : /\bstart\b/.test(sql) ? (crashed ? "crash recovery runs" : "the server starts") : /\bstop\b/.test(sql) ? "the server shuts down" : "";
      out.obs = { sql: why ? `${sql}   -- ${why}` : sql, tone: "mute" };
      out.obsWho = "server";
    }
    if (st.locks) out.locks = st.locks.map((l) => ({ txn: l.session, obj: l.type === "transactionid" ? `xid ${l.target}` : l.target, mode: l.mode, granted: l.granted }));
    if (rel && st.heap?.[rel]) out.db = committedRows(trace, st, rel);
    return out;
  });
}

/** the rows a brand new transaction would see right after this step */
export function committedRows(trace: PgTrace, st: PgStep, rel: string): Table {
  const cols = trace.rels[rel]?.columns?.map((c) => c.name) ?? Object.keys(st.heap?.[rel]?.[0]?.tuples.find((t) => t.data)?.data ?? {});
  const xact = st.xact ?? {};
  const reader = freshReader(xact);
  const rows: (string | null)[][] = [];
  for (const p of st.heap?.[rel] ?? []) for (const t of p.tuples) if (t.data && visible(t, xact, reader).visible) rows.push(cols.map((c) => t.data?.[c] ?? null));
  return { columns: cols, rows };
}

export const traceLocks = (st: PgStep): LockReq[] =>
  (st.locks ?? []).map((l) => ({ txn: l.session, obj: l.type === "transactionid" ? `xid ${l.target}` : l.target, mode: l.mode, granted: l.granted }));

/* ---- pages, chains, b-trees ------------------------------------------------------ */

export function tracePage(trace: PgTrace, i: number, rel: string, block = 0): Page | undefined {
  return trace.steps[i]?.heap?.[rel]?.find((p) => p.block === block);
}

/** every version of the rows matching select ("id=1"), linked by t_ctid, plus redirects and index entries */
export function chainFromPages(pages: Page[], xact: ChainView["xact"], o: { rel?: string; select?: string; index?: ChainView["index"]; horizon?: number } = {}): ChainView {
  const all: (Tuple & { block: number })[] = pages.flatMap((p) => p.tuples.map((t) => ({ ...t, block: p.block })));
  const key = (b: number, lp: number) => `${b},${lp}`;
  const byTid = new Map(all.map((t) => [key(t.block, t.lp), t]));
  let keep = all.filter((t) => t.lpFlags === "normal" || t.lpFlags === "redirect");
  if (o.select) {
    const [col, val] = o.select.split("=").map((s) => s.trim());
    // grow from the matching versions along t_ctid links and redirects, both directions
    const seed = new Set(all.filter((t) => t.data && String(t.data[col]) === val).map((t) => key(t.block, t.lp)));
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of all) {
        const me = key(t.block, t.lp);
        const next = t.ctid ? key(t.ctid[0], t.ctid[1]) : t.redirect ? key(t.block, t.redirect) : null;
        if (!next || next === me) continue;
        if (seed.has(me) && !seed.has(next) && byTid.has(next)) (seed.add(next), (grew = true));
        if (seed.has(next) && !seed.has(me)) (seed.add(me), (grew = true));
      }
    }
    keep = keep.filter((t) => seed.has(key(t.block, t.lp)));
    if (o.index) o = { ...o, index: o.index.filter((e) => seed.has(key(e.tid[0], e.tid[1]))) };
  }
  // oldest first: follow chains from their roots
  const order: (Tuple & { block: number })[] = [];
  const pointed = new Set(keep.flatMap((t) => (t.ctid && key(t.ctid[0], t.ctid[1]) !== key(t.block, t.lp) ? [key(t.ctid[0], t.ctid[1])] : t.redirect ? [key(t.block, t.redirect)] : [])));
  const seen = new Set<string>();
  const follow = (t: Tuple & { block: number }) => {
    const k = key(t.block, t.lp);
    if (seen.has(k)) return;
    seen.add(k);
    order.push(t);
    const nk = t.redirect ? key(t.block, t.redirect) : t.ctid ? key(t.ctid[0], t.ctid[1]) : null;
    const n = nk ? keep.find((x) => key(x.block, x.lp) === nk) : undefined;
    if (n) follow(n);
  };
  keep.filter((t) => !pointed.has(key(t.block, t.lp))).forEach(follow);
  keep.forEach(follow);
  return { rel: o.rel, versions: order, xact, horizon: o.horizon, index: o.index };
}

/**
 * the oldest xid anything open at this step still needs: every session's snapshot xmin, every
 * assigned xid, every transaction clog says is in progress. a version deleted by a committed
 * xid below this is dead to every snapshot (removable). nothing open: one past the newest xid.
 */
export function horizonAt(st: PgStep): number {
  const xact = st.xact ?? {};
  const need: number[] = [];
  for (const x of Object.values(st.xids ?? {})) {
    if (x.snap) need.push(x.snap.xmin);
    if (x.xid) need.push(x.xid);
  }
  for (const [xid, s] of Object.entries(xact)) if (s === "in progress") need.push(Number(xid));
  return need.length ? Math.min(...need) : Math.max(0, ...Object.keys(xact).map(Number)) + 1;
}

export function traceChain(trace: PgTrace, i: number, rel: string, select?: string): ChainView {
  const st = trace.steps[i];
  const idxName = Object.keys(st.btree ?? {})[0];
  const bt = idxName ? st.btree![idxName] : undefined;
  const index = bt?.pages.filter((p) => p.type === "l" || (p.type === "r" && p.level === 0)).flatMap((p) => p.items.map((it) => ({ key: it.key, tid: (it.tid ?? [0, 0]) as Tid, dead: it.dead })));
  return chainFromPages(st.heap?.[rel] ?? [], st.xact ?? {}, { rel, select, index, horizon: horizonAt(st) });
}

type BtPages = NonNullable<PgStep["btree"]>[string] & { pages: { n?: number; nitems?: number }[] };

/** bt_page_items pages → BTreeView. internal pages: the first item is the "minus infinity" downlink */
export function btreeFromPages(t: BtPages): BTreeView {
  const nodes: Record<string, BTreeNode> = {};
  for (const p of t.pages) {
    const id = `b${p.blk}`;
    const leaf = p.level === 0;
    const n: BTreeNode = { id, level: p.level, keys: [] };
    if (leaf) {
      n.keys = p.items.map((it) => it.key);
      n.tids = p.items.map((it) => (it.tids ? it.tids : (it.tid ?? null)));
      n.dead = p.items.map((it) => it.dead);
      if (p.items.some((it) => it.tids)) n.posting = p.items.map((it) => it.tids?.length ?? 1);
    } else {
      n.keys = p.items.slice(1).map((it) => it.key);
      n.kids = p.items.map((it) => `b${it.tid?.[0] ?? 0}`);
    }
    if (p.next) n.right = `b${p.next}`;
    if (p.high !== undefined) n.high = p.high;
    // the btree probe trims a big page to its first ceil(keep/2) and last floor(keep/2) items, and keeps the count in `n`
    const total = (p as { n?: number; nitems?: number }).n ?? (p as { nitems?: number }).nitems;
    if (total && total > p.items.length) {
      n.more = total - p.items.length;
      n.moreAt = Math.ceil(p.items.length / 2);
    }
    nodes[id] = n;
  }
  return { root: `b${t.root}`, nodes };
}

export function traceBTree(trace: PgTrace, i: number, idx: string): BTreeView | undefined {
  const t = trace.steps[i]?.btree?.[idx];
  return t ? btreeFromPages(t) : undefined;
}

/* ---- buffers and WAL ----------------------------------------------------------------- */

export function tracePool(trace: PgTrace, i: number, o: { forks?: string[] } = {}): PoolView | undefined {
  const b = trace.steps[i]?.buffers;
  if (!b) return undefined;
  const forks = o.forks ?? ["main"];
  const frames = b.frames
    .filter((f) => forks.includes(f.fork))
    .map((f) => ({ id: f.id, page: { rel: f.fork === "main" ? f.rel : `${f.rel}.${f.fork}`, block: f.block }, dirty: f.dirty, pins: f.pins, usage: f.usage }));
  return { frames, hand: -1, table: true, stats: { hit: 0, read: 0, evicted: 0, written: 0 }, other: b.other };
}

/** WAL as of step i: every record captured so far, the insert/flush pointers, and page LSNs */
export function traceWal(trace: PgTrace, i: number): WalView | undefined {
  const st = trace.steps[i];
  if (!st?.wal) return undefined;
  const records = trace.steps.slice(0, i + 1).flatMap((s) => s.wal?.records ?? []);
  const before = trace.steps.slice(0, i).flatMap((s) => s.wal?.records ?? []).length;
  const dirty = new Set((st.buffers?.frames ?? []).filter((f) => f.dirty && f.fork === "main").map((f) => `${f.rel}·${f.block}`));
  const pages = Object.entries(st.heap ?? {}).flatMap(([rel, ps]) => ps.map((p) => ({ label: `${rel}·${p.block}`, lsn: p.lsn ?? 0, dirty: dirty.has(`${rel}·${p.block}`) })));
  return {
    records: records.map((r) => ({ lsn: r.lsn, len: r.len, end: r.end, prev: r.prev, xid: r.xid, rmgr: r.rmgr, type: r.type, desc: r.desc, blocks: r.blocks })),
    insert: st.wal.insert,
    flush: st.wal.flush,
    redo: st.wal.redo,
    checkpoint: st.wal.checkpoint,
    // count LSNs from the earliest thing on screen, so offsets read forward
    base: Math.min(trace.base.lsn, st.wal.redo, ...pages.map((p) => p.lsn || Infinity)),
    pages,
    fresh: records.length > before ? records.length - 1 : undefined,
  };
}

/* ---- ClauseStepper stages ------------------------------------------------------------- */

/** the @stages step: step `i` if given, else the first step that has stages */
const stagesStep = (trace: PgTrace, i?: number) => (i != null ? trace.steps[i] : trace.steps.find((s) => s.stages?.length));

/** a capture's @stages as ClauseStepper stages, with each stage's note, prefix query and group */
export function traceStages(trace: PgTrace, step?: number): { clause: string; columns: (string | { name: string; type?: string })[]; rows: (string | null)[][]; note?: string; sql?: string; group?: string }[] {
  const st = stagesStep(trace, step);
  // with types (as resultOf gives ResultTable), so stage tables head their columns the same way
  return (st?.stages ?? []).map((s) => ({
    clause: s.clause,
    columns: s.types?.length === s.columns.length ? s.columns.map((name, j) => ({ name, type: s.types![j] })) : s.columns,
    rows: s.data,
    ...(s.note ? { note: s.note } : {}),
    ...(s.sql ? { sql: s.sql } : {}),
    ...(s.group ? { group: s.group } : {}),
  }));
}

/** the query a capture's @stages step ran, with its semicolon */
export function traceStagesSql(trace: PgTrace, step?: number): string | undefined {
  const st = stagesStep(trace, step);
  if (!st) return undefined;
  // comment lines dropped, one trailing semicolon (the same tidy-up as captured.ts sqlOf)
  const q = st.sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .trim();
  return q.endsWith(";") ? q : `${q};`;
}

/* ---- heap files -------------------------------------------------------------------- */

/** per page live / dead / free bytes as of step i. dead = removable by vacuum right now */
export function heapFileFromTrace(trace: PgTrace, i: number, rel: string): import("./views").HeapFileView | undefined {
  const st = trace.steps[i];
  const pages = st?.heap?.[rel];
  if (!pages) return undefined;
  const xact = st.xact ?? {};
  // the vacuum horizon: running xids and every probed session's snapshot xmin (an open
  // repeatable read snapshot holds dead rows even with no xid of its own)
  const horizon = horizonAt(st);
  const al = (x: number) => Math.ceil(x / 8) * 8;
  return {
    rel,
    size: trace.engine.blockSize,
    pages: pages.map((p) => {
      let used = 0;
      let dead = 0;
      for (const t of p.tuples) {
        if (t.lpFlags !== "normal" || !t.len) continue;
        if (removable(t, xact, horizon)) dead += al(t.len);
        else used += al(t.len);
      }
      const vm = st.vm?.[rel]?.find((v) => v.block === p.block);
      return { block: p.block, used, dead, free: Math.max(0, p.upper - p.lower), allVisible: vm?.allVisible, allFrozen: vm?.allFrozen };
    }),
  };
}
