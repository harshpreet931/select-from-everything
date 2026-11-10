// probes: what pgtrace reads from the server after a step. every probe runs in the observer
// connection (never inside a scenario session, with the exceptions documented on `xids`), and
// they always run in this order, because some of them disturb what later ones would see:
//
//   1 xids     pg_stat_activity, SHOW / pg_current_snapshot() in idle-in-transaction sessions
//   2 locks    pg_locks + pg_blocking_pids
//   3 buffers  pg_buffercache (before any page probe: get_raw_page reads through shared buffers)
//   4 wal      insert / flush / redo / checkpoint pointers (records are read later, see run.mjs)
//   5 pages    heap, btree, hash, vm, fsm (pageinspect, pg_visibility, pg_freespacemap)
//   6 rows     SELECT ctid, * FROM rel (sets hint bits: an observer effect, so it's opt-in)
//   7 explain  (part of an @explain step)
//   8 stats    pg_stat_user_tables / _indexes / pg_statio_user_tables
//   9 stages   (part of an @stages step)
//  10 log      server log lines since the last log probe
//
// values are kept raw (xids as numbers, LSNs as numbers, page offsets as numbers). display
// normalisation (xid aliases, LSN offsets from base) is the adapters' job, not ours.

import { lsnToNumber } from "../../../scripts/lib/native-pg.mjs";
import { decodeKey, decodeValue } from "./decode.mjs";

export const ORDER = ["xids", "locks", "buffers", "wal", "heap", "btree", "hash", "vm", "fsm", "rows", "stats", "log"];
const LP = ["unused", "normal", "redirect", "dead"];
const FORK = ["main", "fsm", "vm", "init"];

export const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const num = (v) => (v == null ? null : Number(v));
const tid = (s) => {
  const m = /^\((\d+),(\d+)\)$/.exec(s ?? "");
  return m ? [Number(m[1]), Number(m[2])] : undefined;
};
const pgArray = (s) => {
  if (s == null) return [];
  if (Array.isArray(s)) return s;
  const inner = String(s).replace(/^\{|\}$/g, "");
  return inner ? inner.split(",").map((x) => x.replace(/^"|"$/g, "")) : [];
};

/** "754:757:754,755" → { xmin, xmax, xip } */
export function parseSnap(s) {
  if (!s) return null;
  const [xmin, xmax, xip] = s.split(":");
  return { xmin: Number(xmin), xmax: Number(xmax), xip: xip ? xip.split(",").map(Number) : [] };
}

/**
 * relation catalogue for the scenario's own objects (public schema, plus their toast tables).
 * refreshed before probes that need it, because VACUUM FULL, TRUNCATE and REINDEX change filenodes.
 */
export class Catalog {
  constructor(q) {
    this.q = q;
    this.rels = new Map(); // display name → info
    this.byNode = new Map(); // relfilenode → display name (also remembers old filenodes)
    this.otherNodes = new Map();
    this.cols = new Map();
    this.used = new Set(); // toast relations a probe looked at
  }

  async refresh() {
    const rows = await this.q(`
      SELECT c.oid::int8::text, CASE WHEN n.nspname = 'public' THEN c.relname::text ELSE n.nspname || '.' || c.relname END,
             c.relkind::text, coalesce(am.amname::text, ''), pg_relation_filenode(c.oid)::text, pg_relation_size(c.oid)::text
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_am am ON am.oid = c.relam
      WHERE c.relkind IN ('r','i','t','m')
        AND (n.nspname = 'public' OR (n.nspname = 'pg_toast' AND c.oid IN (
              SELECT reltoastrelid FROM pg_class WHERE relnamespace = 'public'::regnamespace
              UNION SELECT indexrelid FROM pg_index WHERE indrelid IN (SELECT reltoastrelid FROM pg_class WHERE relnamespace = 'public'::regnamespace))))
      ORDER BY c.oid`);
    this.rels.clear();
    for (const [oid, name, kind, am, node, size] of rows) {
      this.rels.set(name, { oid: Number(oid), name, kind: kind === "i" ? "index" : "table", am, node: num(node), size: Number(size) });
      if (node) this.byNode.set(Number(node), name);
    }
  }

  get(name) {
    const r = this.rels.get(name);
    if (!r) throw new Error(`no relation "${name}" (have: ${[...this.rels.keys()].join(", ") || "none"})`);
    this.used.add(name);
    return r;
  }

  /** columns (attnum order, dropped ones kept as { dropped: true }) */
  async columns(name) {
    const r = this.get(name);
    const rows = await this.q(`
      SELECT a.attnum::text, a.attname::text, coalesce(t.typname::text, ''), a.attisdropped
      FROM pg_attribute a LEFT JOIN pg_type t ON t.oid = a.atttypid
      WHERE a.attrelid = ${r.oid} AND a.attnum > 0 ORDER BY a.attnum`);
    return rows.map(([attnum, name, type, dropped]) => ({ attnum: Number(attnum), name, type, dropped: dropped === "t" }));
  }

  /** a name for a relfilenode seen in WAL or the buffer pool, for relations outside the scenario too */
  async nodeName(node) {
    if (this.byNode.has(node)) return this.byNode.get(node);
    if (this.otherNodes.has(node)) return this.otherNodes.get(node);
    let name = `filenode ${node}`;
    // after @crash there's no server to ask: cacheNodes() ran before it, anything else stays a number
    if (!this.offline) {
      try {
        const rows = await this.q(`SELECT pg_filenode_relation(0, ${node})::regclass::text`);
        name = rows[0]?.[0] ?? name;
      } catch {
        // the observer went away under us: keep the number
      }
    }
    this.otherNodes.set(node, name);
    return name;
  }

  /** remember every relation's relfilenode now, so WAL read after a crash can still be named */
  async cacheNodes() {
    const rows = await this.q(`SELECT pg_relation_filenode(c.oid)::text, c.oid::regclass::text FROM pg_class c WHERE pg_relation_filenode(c.oid) IS NOT NULL`);
    for (const [node, name] of rows) if (!this.byNode.has(Number(node))) this.otherNodes.set(Number(node), name);
  }

  /** the trace's `rels` entry for everything currently known */
  async describe() {
    const out = {};
    for (const [name, r] of this.rels) {
      if (name.startsWith("pg_toast.") && !this.used.has(name)) continue;
      const e = { kind: r.kind, am: r.am };
      if (r.kind === "table") e.columns = (await this.columns(name)).filter((c) => !c.dropped).map(({ name, type }) => ({ name, type }));
      else {
        const cols = await this.q(`
          SELECT a.attname::text, t.typname::text FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
          WHERE a.attrelid = ${r.oid} AND a.attnum > 0 ORDER BY a.attnum`);
        e.columns = cols.map(([name, type]) => ({ name, type }));
        const on = await this.q(`SELECT indrelid::regclass::text FROM pg_index WHERE indexrelid = ${r.oid}`);
        if (on[0]) e.on = on[0][0];
      }
      out[name] = e;
    }
    return out;
  }
}

/** "0-2" | "1" | undefined → block numbers, capped to what exists */
function blocks(arg, n, cap = 4) {
  if (!arg) return Array.from({ length: Math.min(n, cap) }, (_, i) => i);
  const m = /^(\d+)(?:-(\d+))?$/.exec(arg);
  if (!m) throw new Error(`bad block range "${arg}" (use 0 or 0-3)`);
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  const out = [];
  for (let i = a; i <= b && i < n; i++) out.push(i);
  return out;
}

const opt = (args, k) => args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1);

// ---------------------------------------------------------------------------------- 1 xids

/**
 * per session: { xid, snap, iso, inTxn }.
 * xid comes from pg_stat_activity (no session involvement). isolation comes from SHOW in the
 * session, which takes no snapshot. the snapshot comes from pg_current_snapshot() in the session,
 * but only when that can't change anything: never in a repeatable read / serializable
 * transaction before its first real statement (that would *take* the snapshot), never while the
 * session is blocked (we reuse the last one), never in a failed transaction.
 */
export async function probeXids(ctx) {
  const out = {};
  const pids = ctx.sessions.filter((s) => s.pid != null).map((s) => s.pid);
  const act = new Map();
  if (ctx.hasActivity && pids.length) {
    const rows = await ctx.q(`SELECT pid::text, backend_xid::text, backend_xmin::text, (xact_start IS NOT NULL) FROM pg_stat_activity WHERE pid = ANY('{${pids.join(",")}}'::int[])`);
    for (const [pid, xid, xmin, inTxn] of rows) act.set(Number(pid), { xid: num(xid), xmin: num(xmin), inTxn: inTxn === "t" });
  }
  for (const s of ctx.sessions) {
    const a = act.get(s.pid);
    // a failed statement (a COMMIT that hits 40001, a woken waiter's error) rejects before its
    // ReadyForQuery arrives: read the status once it has, or iso depends on timing
    if (!s.dead && !s.pending && s.settle) await s.settle();
    const txn = s.txn(); // I | T | E, from the wire
    const e = { xid: a?.xid ?? null, snap: null, iso: s.iso, inTxn: a ? a.inTxn : txn !== "I" };
    if (!s.dead && !s.pending && txn === "T") {
      try {
        e.iso = (await s.query("SHOW transaction_isolation"))[0][0];
        s.iso = e.iso;
        if (e.iso === "read committed" || s.snapTaken) {
          // read committed: this is a snapshot taken now, at probe time. each statement takes its
          // own, so it says what the session's NEXT statement would see, not the last one.
          const [[snap, xid]] = await s.query("SELECT pg_current_snapshot()::text, pg_current_xact_id_if_assigned()::text");
          e.snap = parseSnap(snap);
          if (!ctx.hasActivity) e.xid = num(xid);
          if (e.iso !== "read committed") s.lastSnap = e.snap;
        }
      } catch (err) {
        // the server ended this session (idle_in_transaction_session_timeout, pg_terminate_backend):
        // record it as gone instead of failing the capture
        if (!/connection|terminat|not queryable|closed/i.test(String(err?.message))) throw err;
        s.dead = true;
        e.snap = null;
        e.xid = null;
        e.inTxn = false;
      }
    } else if (s.pending && s.iso !== "read committed") e.snap = s.lastSnap ?? null;
    if ((txn === "I" || s.dead) && !s.pending) {
      e.xid = null;
      e.inTxn = false;
    }
    out[s.name] = e;
  }
  return out;
}

/** xact status for every xid we've seen: { 754: "committed", ... } */
export async function probeXact(ctx, xids) {
  const list = [...new Set(xids)].filter((x) => Number.isFinite(x) && x >= 3).sort((a, b) => a - b);
  if (!list.length) return {};
  const rows = await ctx.q(`SELECT x, pg_xact_status(x::xid8)::text FROM unnest('{${list.join(",")}}'::text[]) x`);
  const out = {};
  for (const [x, st] of rows) out[x] = st;
  return out;
}

// ---------------------------------------------------------------------------------- 2 locks

function lockTarget(type, rel, page, tuple, vxid, xid, classid, objid, objsubid) {
  switch (type) {
    case "relation":
      return rel;
    case "page":
      return `${rel} page ${page}`;
    case "tuple":
      return `${rel} (${page},${tuple})`;
    case "transactionid":
      return xid;
    case "virtualxid":
      return vxid;
    case "advisory":
      return `${classid}:${objid}:${objsubid}`;
    default:
      return `${classid}/${objid}${objsubid && objsubid !== "0" ? `/${objsubid}` : ""}`;
  }
}

export async function probeLocks(ctx, onlyPid = null) {
  const pids = onlyPid ? [onlyPid] : ctx.sessions.filter((s) => s.pid != null && !s.dead).map((s) => s.pid);
  if (!pids.length) return [];
  const rows = await ctx.q(`
    SELECT pid::text, locktype::text, mode::text, granted, relation::regclass::text, page::text, tuple::text,
           virtualxid::text, transactionid::text, classid::text, objid::text, objsubid::text
    FROM pg_locks WHERE pid = ANY('{${pids.join(",")}}'::int[])`);
  const order = new Map(ctx.sessions.map((s, i) => [s.pid, i]));
  return rows
    .map(([pid, type, mode, granted, rel, page, tuple, vxid, xid, classid, objid, objsubid]) => ({
      session: ctx.pidName.get(Number(pid)) ?? `pid ${pid}`,
      type,
      target: lockTarget(type, rel, page, tuple, vxid, xid, classid, objid, objsubid),
      mode,
      granted: granted === "t",
      _o: order.get(Number(pid)) ?? 99,
    }))
    .sort((a, b) => a._o - b._o || Number(b.granted) - Number(a.granted) || a.type.localeCompare(b.type) || a.target.localeCompare(b.target) || a.mode.localeCompare(b.mode))
    .map(({ _o, ...l }) => l);
}

// ---------------------------------------------------------------------------------- 3 buffers

export async function probeBuffers(ctx) {
  const nodes = [...ctx.cat.rels.values()].map((r) => r.node).filter(Boolean);
  const db = `(SELECT oid FROM pg_database WHERE datname = current_database())`;
  const frames = nodes.length
    ? await ctx.q(`
        SELECT bufferid::text, relfilenode::text, relforknumber::text, relblocknumber::text, isdirty, usagecount::text, pinning_backends::text
        FROM pg_buffercache WHERE reldatabase = ${db} AND relfilenode = ANY('{${nodes.join(",")}}'::oid[]) ORDER BY bufferid`)
    : [];
  const [[used, dirty]] = await ctx.q(`SELECT buffers_used::text, buffers_dirty::text FROM pg_buffercache_summary()`);
  return {
    frames: frames.map(([id, node, fork, block, isdirty, usage, pins]) => ({
      id: Number(id),
      rel: ctx.cat.byNode.get(Number(node)) ?? `filenode ${node}`,
      fork: FORK[Number(fork)] ?? fork,
      block: Number(block),
      dirty: isdirty === "t",
      usage: Number(usage),
      pins: Number(pins),
    })),
    other: Number(used) - frames.length,
    summary: { used: Number(used), dirty: Number(dirty) },
  };
}

// ---------------------------------------------------------------------------------- 4 wal

export async function walPointers(ctx) {
  const [[insert, flush, redo, checkpoint]] = await ctx.q(
    `SELECT pg_current_wal_insert_lsn()::text, pg_current_wal_flush_lsn()::text, redo_lsn::text, checkpoint_lsn::text FROM pg_control_checkpoint()`,
  );
  return { insert: lsnToNumber(insert), flush: lsnToNumber(flush), redo: lsnToNumber(redo), checkpoint: lsnToNumber(checkpoint) };
}

const BLKREF = /blkref #\d+: rel (\d+)\/(\d+)\/(\d+)(?: fork (\w+))? blk (\d+)([^,]*(?:; hole: offset: \d+, length: \d+)?)?/g;

async function blocksOf(ctx, text) {
  const out = [];
  if (!text) return out;
  for (const m of text.matchAll(BLKREF)) {
    const node = Number(m[3]);
    let rel = await ctx.cat.nodeName(node);
    if (m[4] && m[4] !== "main") rel = `${rel} (${m[4]})`;
    out.push({ rel, block: Number(m[5]), fpi: /FPW/.test(m[6] ?? "") });
  }
  return out;
}

/** WAL records between two LSNs, via pg_walinspect (readable up to the flush pointer only) */
export async function readWal(ctx, from, to) {
  if (to <= from) return [];
  const rows = await ctx.q(`
    SELECT start_lsn::text, end_lsn::text, prev_lsn::text, xid::text, resource_manager::text, record_type::text,
           record_length::text, fpi_length::text, coalesce(description, ''), coalesce(block_ref, '')
    FROM pg_get_wal_records_info('${lsnStr(from)}', '${lsnStr(to)}') ORDER BY start_lsn`);
  const out = [];
  for (const [lsn, end, prev, xid, rmgr, type, len, fpi, desc, blockRef] of rows)
    out.push({
      lsn: lsnToNumber(lsn),
      end: lsnToNumber(end),
      prev: lsnToNumber(prev),
      xid: Number(xid),
      rmgr,
      type,
      len: Number(len),
      fpiLen: Number(fpi),
      desc: normalizeText(desc),
      blocks: await blocksOf(ctx, blockRef),
    });
  return out;
}

/** parse `pg_waldump` output into the same record shape */
export async function parseWaldump(ctx, text) {
  const out = [];
  const re = /^rmgr: (\S+)\s+len \(rec\/tot\):\s*(\d+)\/\s*(\d+), tx:\s*(\d+), lsn: ([0-9A-F]+\/[0-9A-F]+), prev ([0-9A-F]+\/[0-9A-F]+), desc: (\S+)\s?(.*)$/;
  for (const line of text.split("\n")) {
    const m = re.exec(line);
    if (!m) continue;
    const [, rmgr, rec, tot, xid, lsn, prev, type, rest] = m;
    const cut = rest.search(/,? ?blkref #/);
    const desc = (cut >= 0 ? rest.slice(0, cut) : rest).replace(/,\s*$/, "").trim();
    const start = lsnToNumber(lsn);
    out.push({
      lsn: start,
      end: start + Number(tot),
      prev: lsnToNumber(prev),
      xid: Number(xid),
      rmgr,
      type,
      len: Number(tot),
      fpiLen: Number(tot) - Number(rec),
      desc: normalizeText(desc),
      blocks: await blocksOf(ctx, cut >= 0 ? rest.slice(cut) : ""),
    });
  }
  return out;
}

export function lsnStr(n) {
  return `${Math.floor(n / 2 ** 32).toString(16).toUpperCase()}/${(n % 2 ** 32).toString(16).toUpperCase()}`;
}

// ---------------------------------------------------------------------------------- 5 pages

export async function probeHeap(ctx, args) {
  const [name, range] = args;
  const r = ctx.cat.get(name);
  const n = Math.floor(r.size / ctx.blockSize);
  const list = blocks(range, n);
  if (!range && n > 4) ctx.warn(`heap(${name}): ${n} blocks, showing 0-3. pass a range, heap(${name}, 0-${n - 1}), for more`);
  const cols = await ctx.cat.columns(name);
  const pages = [];
  for (const blk of list) {
    const raw = `(SELECT raw FROM p)`;
    const body = (withData) => `
      WITH p AS MATERIALIZED (SELECT get_raw_page(${lit(name)}, ${blk}) AS raw)
      SELECT json_build_object(
        'h', (SELECT row_to_json(h) FROM page_header(${raw}) h),
        'items', (SELECT coalesce(json_agg(json_build_object(
            'lp', i.lp, 'off', i.lp_off, 'flags', i.lp_flags, 'len', i.lp_len,
            'xmin', i.t_xmin::text, 'xmax', i.t_xmax::text, 'ctid', i.t_ctid::text,
            'im2', i.t_infomask2, 'im', i.t_infomask, 'hoff', i.t_hoff, 'bits', i.t_bits,
            'f', (SELECT raw_flags FROM heap_tuple_infomask_flags(i.t_infomask, i.t_infomask2)),
            'cf', (SELECT combined_flags FROM heap_tuple_infomask_flags(i.t_infomask, i.t_infomask2))
            ${
              withData
                ? `, 'd', CASE WHEN i.lp_flags = 1 AND i.t_data IS NOT NULL THEN (
                    SELECT json_agg(encode(x.v, 'hex') ORDER BY x.o)
                    FROM unnest(tuple_data_split(${r.oid}::oid, i.t_data, i.t_infomask, i.t_infomask2, i.t_bits)) WITH ORDINALITY x(v, o)) END`
                : ""
            }
          ) ORDER BY i.lp), '[]'::json) FROM heap_page_items(${raw}) i)
      )::text`;
    let res;
    try {
      res = JSON.parse((await ctx.q(body(true)))[0][0]);
    } catch (e) {
      ctx.warn(`heap(${name}) block ${blk}: no values (${e.message.split("\n")[0]})`);
      res = JSON.parse((await ctx.q(body(false)))[0][0]);
    }
    const h = res.h;
    const tuples = res.items.map((it) => {
      const t = { lp: it.lp, lpFlags: LP[it.flags] ?? String(it.flags) };
      if (t.lpFlags === "redirect") t.redirect = it.off;
      else if (it.len > 0) {
        t.off = it.off;
        t.len = it.len;
      }
      if (it.xmin != null) {
        t.xmin = Number(it.xmin);
        t.xmax = Number(it.xmax);
        t.ctid = tid(it.ctid);
        t.infomask = it.im;
        t.infomask2 = it.im2;
        t.hoff = it.hoff;
        if (it.bits) t.nullBits = it.bits;
        t.flags = [...new Set([...(it.f ?? []), ...(it.cf ?? [])])];
        if (it.d) {
          t.data = {};
          it.d.forEach((hex, i) => {
            const c = cols[i];
            if (c && !c.dropped) t.data[c.name] = decodeValue(hex, c.type);
          });
        }
      }
      return t;
    });
    const page = { rel: name, block: blk, size: h.pagesize, lower: h.lower, upper: h.upper, special: h.special, lsn: lsnToNumber(h.lsn) };
    if (h.prune_xid && Number(h.prune_xid)) page.pruneXid = Number(h.prune_xid);
    page.tuples = tuples;
    pages.push(page);
  }
  return pages;
}

export async function probeBtree(ctx, args) {
  const [name] = args;
  const keep = Number(opt(args, "items") ?? 0);
  const r = ctx.cat.get(name);
  if (r.am !== "btree") throw new Error(`btree(${name}): ${name} is a ${r.am || r.kind}, not a btree index`);
  const n = Math.floor(r.size / ctx.blockSize);
  const types = (await ctx.q(`SELECT t.typname::text FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid WHERE a.attrelid = ${r.oid} AND a.attnum > 0 ORDER BY a.attnum`)).map(
    (x) => x[0],
  );
  const meta = JSON.parse((await ctx.q(`SELECT row_to_json(m)::text FROM bt_metap(${lit(name)}) m`))[0][0]);
  const pages = [];
  for (let blk = 1; blk < n; blk++) {
    let s;
    let items;
    try {
      [[s, items]] = await ctx.q(`
        SELECT (SELECT row_to_json(s) FROM bt_page_stats(${lit(name)}, ${blk}) s)::text,
               (SELECT coalesce(json_agg(json_build_object('off', i.itemoffset, 'ctid', i.ctid::text, 'nulls', i.nulls, 'data', i.data, 'dead', i.dead,
                  'htid', i.htid::text, 'tids', i.tids::text[]) ORDER BY i.itemoffset), '[]'::json) FROM bt_page_items(${lit(name)}, ${blk}) i)::text`);
    } catch (e) {
      ctx.warn(`btree(${name}) block ${blk}: ${e.message.split("\n")[0]}`);
      continue;
    }
    s = JSON.parse(s);
    items = JSON.parse(items);
    const page = { blk, type: s.type, level: s.btpo_level, prev: s.btpo_prev, next: s.btpo_next };
    let list = items;
    if (s.btpo_next !== 0 && list.length) {
      page.high = decodeKey(list[0].data, types, { nulls: list[0].nulls });
      list = list.slice(1);
    }
    const leaf = s.type === "l" || (s.type === "r" && s.btpo_level === 0);
    page.items = list.map((it) => {
      const e = { off: it.off, key: decodeKey(it.data, types, { nulls: it.nulls }) };
      if (leaf) {
        const t = tid(it.htid) ?? tid(it.ctid);
        if (t) e.tid = t;
        if (it.tids && it.tids.length > 1) e.tids = it.tids.map(tid);
      } else e.tid = tid(it.ctid);
      e.dead = !!it.dead;
      return e;
    });
    if (keep && page.items.length > keep) {
      page.n = page.items.length;
      page.items = [...page.items.slice(0, Math.ceil(keep / 2)), ...page.items.slice(page.items.length - Math.floor(keep / 2))];
    }
    pages.push(page);
  }
  return { root: meta.root, levels: meta.level + 1, pages };
}

export async function probeHash(ctx, args) {
  const [name] = args;
  const r = ctx.cat.get(name);
  if (r.am !== "hash") throw new Error(`hash(${name}): ${name} is a ${r.am || r.kind}, not a hash index`);
  const n = Math.floor(r.size / ctx.blockSize);
  const m = JSON.parse((await ctx.q(`SELECT row_to_json(m)::text FROM hash_metapage_info(get_raw_page(${lit(name)}, 0)) m`))[0][0]);
  const meta = {};
  for (const [k, v] of Object.entries(m)) if (typeof v === "number") meta[k] = v;
  const pages = [];
  for (let blk = 1; blk < n; blk++) {
    const [[type]] = await ctx.q(`SELECT hash_page_type(get_raw_page(${lit(name)}, ${blk}))`);
    const page = { blk, type, items: [] };
    if (type === "bucket" || type === "overflow") {
      const [[st, items]] = await ctx.q(`
        SELECT (SELECT row_to_json(s) FROM hash_page_stats(get_raw_page(${lit(name)}, ${blk})) s)::text,
               (SELECT coalesce(json_agg(json_build_object('off', i.itemoffset, 'ctid', i.ctid::text, 'hash', i.data) ORDER BY i.itemoffset), '[]'::json)
                FROM hash_page_items(get_raw_page(${lit(name)}, ${blk})) i)::text`);
      const s = JSON.parse(st);
      page.bucket = s.hasho_bucket;
      if (s.hasho_nextblkno !== 4294967295) page.next = s.hasho_nextblkno;
      page.items = JSON.parse(items).map((it) => ({ off: it.off, hash: Number(it.hash), tid: tid(it.ctid) }));
    }
    pages.push(page);
  }
  return { meta, pages };
}

export async function probeVm(ctx, [name]) {
  ctx.cat.get(name);
  const rows = await ctx.q(`SELECT blkno::text, all_visible, all_frozen FROM pg_visibility_map(${lit(name)}) ORDER BY blkno`);
  return rows.map(([b, v, f]) => ({ block: Number(b), allVisible: v === "t", allFrozen: f === "t" }));
}

export async function probeFsm(ctx, [name]) {
  ctx.cat.get(name);
  const rows = await ctx.q(`SELECT blkno::text, avail::text FROM pg_freespace(${lit(name)}) ORDER BY blkno`);
  return rows.map(([b, a]) => ({ block: Number(b), avail: Number(a) }));
}

// ---------------------------------------------------------------------------------- 6 rows

/** the committed rows, as a brand-new transaction sees them. sets hint bits, so it's opt-in. */
export async function probeRows(ctx, [name]) {
  const r = ctx.cat.get(name);
  const res = await ctx.run(`SELECT ctid, * FROM ${r.name} ORDER BY ctid`);
  if (res.error) throw new Error(`rows(${name}): ${res.error.message}`);
  return { columns: res.columns.map((c) => ({ name: c.name, type: c.type })), data: res.rows };
}

// ---------------------------------------------------------------------------------- 8 stats

export async function probeStats(ctx, names) {
  for (const s of ctx.sessions) {
    // flush each idle session's pending counters (only outside a transaction: inside one
    // they aren't reportable yet, and a SELECT could take a repeatable read snapshot)
    if (!s.dead && !s.pending && s.txn() === "I") await s.query("SELECT pg_stat_force_next_flush()");
  }
  const want = names.length ? names : [...ctx.cat.rels.keys()];
  const out = {};
  for (const name of want) {
    const r = ctx.cat.get(name);
    const sql =
      r.kind === "index"
        ? `SELECT row_to_json(x)::text FROM (SELECT s.idx_scan, s.idx_tup_read, s.idx_tup_fetch, io.idx_blks_read, io.idx_blks_hit
             FROM pg_stat_all_indexes s JOIN pg_statio_all_indexes io USING (indexrelid) WHERE s.indexrelid = ${r.oid}) x`
        : `SELECT row_to_json(x)::text FROM (SELECT s.seq_scan, s.seq_tup_read, s.idx_scan, s.idx_tup_fetch, s.n_tup_ins, s.n_tup_upd, s.n_tup_del,
             s.n_tup_hot_upd, s.n_tup_newpage_upd, s.n_live_tup, s.n_dead_tup, io.heap_blks_read, io.heap_blks_hit
             FROM pg_stat_all_tables s JOIN pg_statio_all_tables io USING (relid) WHERE s.relid = ${r.oid}) x`;
    const rows = await ctx.q(sql);
    if (!rows[0]) continue;
    const o = JSON.parse(rows[0][0]);
    out[name] = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? 0 : Number(v)]));
  }
  return out;
}

// ---------------------------------------------------------------------------------- 10 log

/** strip what changes from run to run (timings, timestamps), name pids after their sessions */
export function normalizeText(s, pidName = new Map(), paths = []) {
  if (s == null) return s;
  let t = String(s);
  for (const p of paths) t = t.split(p).join("<dir>");
  t = t.replace(/\.s\.PGSQL\.\d+/g, ".s.PGSQL.<port>");
  t = t.replace(/(starting PostgreSQL [\d.]+)\b.*$/, "$1"); // build string differs per platform
  t = t.replace(/\b(process|PID|pid|Process)\s+(\d+)/g, (m, w, pid) => (pidName.has(Number(pid)) ? `${w} ${pidName.get(Number(pid))}` : m));
  t = t.replace(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?( ?(UTC|GMT|[A-Z]{2,5}\b|[+-]\d\d(:\d\d)?))?/g, "<time>");
  t = t.replace(/ system usage: .*$/gm, "");
  t = t.replace(/(write|sync|total|longest|average)=[\d.]+ s/g, "$1=<t> s");
  t = t.replace(/ after [\d.]+ ms/g, " after <t> ms");
  t = t.replace(/elapsed: [\d.]+ s/g, "elapsed: <t> s");
  // auto_explain / log_min_duration_statement: "duration: 0.247 ms  plan:" or "duration: 12.3 ms  statement: …"
  t = t.replace(/\bduration: [\d.]+ ms/g, "duration: <t> ms");
  // log_lock_waits DETAIL: "Process holding the lock: 123. Wait queue: 124, 125." (pids → session names)
  t = t.replace(/(Process(?:es)? holding the lock: |Wait queue: )([\d, ]+)(?=\.)/g, (m, head, list) =>
    head + list.split(/,\s*/).map((x) => { const n = Number(x.trim()); return pidName.has(n) ? pidName.get(n) : x.trim(); }).join(", "));
  return t;
}

export function probeLog(ctx) {
  const lines = ctx.logSince();
  return lines.map((l) => normalizeText(l, ctx.pidName, ctx.paths));
}
