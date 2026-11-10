// regenerates the fixtures in this folder from real postgres runs (PGlite, postgres 18.6
// compiled to wasm, running in node). the sims in ../sim are tested against these, and the
// dev figure gallery draws them. deterministic: no random(), no timestamps.
//
//   node src/lib/db/fixtures/gen.mjs
//
// every file stays small (well under 60 KB). big captures are trimmed and say so.

import { PGlite } from "@electric-sql/pglite";
import { pageinspect } from "@electric-sql/pglite/contrib/pageinspect";
import { pg_walinspect } from "@electric-sql/pglite/contrib/pg_walinspect";
import { pg_buffercache } from "@electric-sql/pglite/contrib/pg_buffercache";
import { pg_visibility } from "@electric-sql/pglite/contrib/pg_visibility";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const out = (name, data) => {
  const s = JSON.stringify(data);
  writeFileSync(here(name), s + "\n");
  console.log(`${name.padEnd(22)} ${(s.length / 1024).toFixed(1)} KB`);
  if (s.length > 60 * 1024) throw new Error(`${name} is over 60 KB`);
};

async function fresh(conf = []) {
  const db = await PGlite.create({ extensions: { pageinspect, pg_walinspect, pg_buffercache, pg_visibility }, postgresqlconf: ["max_prepared_transactions = 4", ...conf] });
  for (const e of ["pageinspect", "pg_walinspect", "pg_buffercache", "pg_visibility"]) await db.exec(`CREATE EXTENSION ${e}`);
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const version = (await q("select version() v"))[0].v;
  return { db, q, version };
}

const parseLsn = (s) => {
  const [hi, lo] = s.split("/");
  return parseInt(hi, 16) * 2 ** 32 + parseInt(lo, 16);
};
const parseTid = (s) => {
  const m = /\((\d+),(\d+)\)/.exec(s);
  return [Number(m[1]), Number(m[2])];
};
const parseSnap = (s) => {
  const [xmin, xmax, xip] = s.split(":");
  return { xmin: Number(xmin), xmax: Number(xmax), xip: xip ? xip.split(",").map(Number) : [] };
};
const LP = { 0: "unused", 1: "normal", 2: "redirect", 3: "dead" };

// little-endian decode of a column's raw bytes ("\x01000000")
function decode(hex, type) {
  if (hex == null) return null;
  const b = Buffer.from(hex.replace(/^\\x/, ""), "hex");
  if (type === "integer") return String(b.readInt32LE(0));
  if (type === "bigint") return String(b.readBigInt64LE(0));
  if (type === "smallint") return String(b.readInt16LE(0));
  if (type === "boolean") return b[0] ? "t" : "f";
  if (type === "text" || type.startsWith("character varying")) {
    if (b[0] & 1) return b.subarray(1, b[0] >> 1).toString("utf8"); // 1-byte varlena header
    return b.subarray(4).toString("utf8");
  }
  return b.toString("hex");
}

async function columns(q, rel) {
  return (
    await q(
      `SELECT attname AS name, format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum`,
      [rel],
    )
  ).map((r) => ({ name: r.name, type: r.type }));
}

/** a heap page in the views.ts Page shape */
async function heapPage(q, rel, block) {
  const cols = await columns(q, rel);
  const [h] = await q(`SELECT lsn::text, lower, upper, special, pagesize, prune_xid::text FROM page_header(get_raw_page($1, $2))`, [rel, block]);
  const items = await q(
    `SELECT lp, lp_off, lp_flags, lp_len, t_xmin::text, t_xmax::text, t_ctid::text, t_infomask, t_infomask2, t_hoff, t_bits,
            (heap_tuple_infomask_flags(t_infomask, t_infomask2)).raw_flags AS flags,
            tuple_data_split($1::regclass, t_data, t_infomask, t_infomask2, t_bits)::text[] AS data
       FROM heap_page_items(get_raw_page($1, $2)) ORDER BY lp`,
    [rel, block],
  );
  return {
    rel,
    block,
    size: h.pagesize,
    lower: h.lower,
    upper: h.upper,
    special: h.special,
    lsn: parseLsn(h.lsn),
    ...(h.prune_xid !== "0" ? { pruneXid: Number(h.prune_xid) } : {}),
    tuples: items.map((t) => {
      const flags = LP[t.lp_flags];
      const tu = { lp: t.lp, lpFlags: flags };
      if (flags === "redirect") return { ...tu, redirect: t.lp_off };
      if (flags !== "normal") return tu;
      const data = {};
      cols.forEach((c, i) => (data[c.name] = decode(t.data?.[i] ?? null, c.type)));
      return {
        ...tu,
        off: t.lp_off,
        len: t.lp_len,
        xmin: Number(t.t_xmin),
        xmax: Number(t.t_xmax),
        ctid: parseTid(t.t_ctid),
        infomask: t.t_infomask,
        infomask2: t.t_infomask2,
        hoff: t.t_hoff,
        ...(t.t_bits ? { nullBits: t.t_bits } : {}),
        flags: t.flags ?? [],
        data,
      };
    }),
  };
}

async function heapPages(q, rel) {
  const [{ n }] = await q(`SELECT pg_relation_size($1)::int / current_setting('block_size')::int AS n`, [rel]);
  const pages = [];
  for (let b = 0; b < n; b++) pages.push(await heapPage(q, rel, b));
  return pages;
}

const int4key = (data) => {
  if (!data) return "";
  const b = Buffer.from(data.replace(/ /g, ""), "hex");
  return b.length >= 4 ? String(b.readInt32LE(0)) : "";
};

/** a btree in the pgtrace shape. trim = keep only the first/last items of big pages */
async function btree(q, idx, trim) {
  const [m] = await q(`SELECT root, level FROM bt_metap($1)`, [idx]);
  const [{ n }] = await q(`SELECT pg_relation_size($1)::int / current_setting('block_size')::int AS n`, [idx]);
  const pages = [];
  for (let blk = 1; blk < n; blk++) {
    const [st] = await q(`SELECT type, btpo_prev, btpo_next, btpo_level FROM bt_page_stats($1, $2)`, [idx, blk]);
    if (st.type === "d" || st.type === "e") continue;
    const items = await q(`SELECT itemoffset, ctid::text, data, dead, htid::text, tids::text[] FROM bt_page_items($1, $2) ORDER BY itemoffset`, [idx, blk]);
    const rightmost = st.btpo_next === 0;
    let high;
    let body = items;
    if (!rightmost) {
      high = int4key(items[0].data);
      body = items.slice(1);
    }
    const type = blk === m.root ? "r" : st.type;
    const mapped = body.map((it) => {
      const key = int4key(it.data);
      if (st.type === "l") {
        const o = { off: it.itemoffset, key, tid: parseTid(it.htid ?? it.ctid), dead: !!it.dead };
        if (it.tids) o.tids = it.tids.map(parseTid);
        return o;
      }
      return { off: it.itemoffset, key, tid: parseTid(it.ctid), dead: !!it.dead };
    });
    const page = { blk, type, level: st.btpo_level, prev: st.btpo_prev, next: st.btpo_next, ...(high !== undefined ? { high } : {}), items: mapped };
    if (trim && st.type === "l" && mapped.length > trim + 2) {
      page.items = [...mapped.slice(0, trim), ...mapped.slice(-2)];
      page.nitems = mapped.length;
    }
    pages.push(page);
  }
  return { root: m.root, levels: m.level + 1, pages };
}

/** leaf item counts in key order (walk right links from the leftmost leaf) */
async function leafCounts(q, idx) {
  const t = await btree(q, idx);
  const leaves = t.pages.filter((p) => p.type === "l" || (p.type === "r" && p.level === 0));
  let cur = leaves.find((p) => p.prev === 0);
  const counts = [];
  while (cur) {
    counts.push(cur.items.length);
    cur = leaves.find((p) => p.blk === cur.next);
  }
  return { levels: t.levels, leaves: counts };
}

/* ---------------------------------------------------------------------------------- */

async function hashFixtures() {
  const { db, q, version } = await fresh();
  const hs = (await q(`SELECT array_agg(hashint4(k) ORDER BY k) AS h FROM generate_series(1, 1000) k`))[0].h;
  out("hashint4.json", { engine: version, from: 1, to: 1000, hash: hs });

  // a hash index filled one key at a time. VACUUM first so the build estimates 0 rows (2 buckets).
  await db.exec(`CREATE TABLE h (k int)`);
  await db.exec(`VACUUM h`);
  await db.exec(`CREATE INDEX h_k ON h USING hash (k) WITH (fillfactor = 10)`);
  const meta = async () => (await q(`SELECT ntuples::int, ffactor, maxbucket, highmask, lowmask FROM hash_metapage_info(get_raw_page('h_k', 0))`))[0];
  const m0 = await meta();
  const splits = [];
  let last = m0.maxbucket;
  for (let k = 1; k <= 1000; k++) {
    await db.exec(`INSERT INTO h VALUES (${k})`);
    const m = await meta();
    if (m.maxbucket !== last) {
      splits.push({ n: k, maxbucket: m.maxbucket, highmask: m.highmask, lowmask: m.lowmask });
      last = m.maxbucket;
    }
  }
  const final = await meta();
  // bucket membership: walk every page, keep primary bucket pages + their overflow pages
  const [{ n }] = await q(`SELECT pg_relation_size('h_k')::int / 8192 AS n`);
  const keyOf = new Map((await q(`SELECT ctid::text, k FROM h`)).map((r) => [r.ctid, r.k]));
  const buckets = {};
  const overflow = {};
  for (let blk = 1; blk < n; blk++) {
    const [st] = await q(`SELECT hash_page_type(get_raw_page('h_k', $1)) AS t`, [blk]);
    if (st.t !== "bucket" && st.t !== "overflow") continue;
    const [sp] = await q(`SELECT hasho_bucket AS b FROM hash_page_stats(get_raw_page('h_k', $1))`, [blk]);
    const items = await q(`SELECT ctid::text FROM hash_page_items(get_raw_page('h_k', $1))`, [blk]);
    (buckets[sp.b] ??= []).push(...items.map((i) => keyOf.get(i.ctid)));
    if (st.t === "overflow") overflow[sp.b] = (overflow[sp.b] ?? 0) + 1;
  }
  for (const b of Object.keys(buckets)) buckets[b].sort((a, c) => a - c);
  out("hash-index.json", { engine: version, fillfactor: 10, start: m0, splits, final, overflow, buckets });
  await db.close();
}

async function btreeFixtures() {
  const { db, q, version } = await fresh();
  await db.exec(`CREATE TABLE nums (k int); INSERT INTO nums SELECT generate_series(1, 10000); CREATE INDEX nums_k ON nums (k);`);
  const big = await btree(q, "nums_k", 4);
  // sequential vs scattered one-at-a-time inserts into an existing index (split policy)
  await db.exec(`CREATE TABLE seq (k int); CREATE INDEX seq_k ON seq (k); INSERT INTO seq SELECT generate_series(1, 2000);`);
  await db.exec(`CREATE TABLE rnd (k int); CREATE INDEX rnd_k ON rnd (k); INSERT INTO rnd SELECT k FROM generate_series(1, 2000) k ORDER BY (k * 7919) % 2003;`);
  const order = (await q(`SELECT array_agg(k ORDER BY (k * 7919) % 2003) AS o FROM generate_series(1, 2000) k`))[0].o;
  out("btree.json", {
    engine: version,
    big: { rows: 10000, built: "CREATE INDEX after loading 1..10000", ...big },
    seq: { rows: 2000, ...(await leafCounts(q, "seq_k")) },
    rnd: { rows: 2000, order: "(k * 7919) % 2003", first: order.slice(0, 12), ...(await leafCounts(q, "rnd_k")) },
  });
  await db.close();
}

const PRODUCTS = `
CREATE TABLE products (id int PRIMARY KEY, name text NOT NULL, category text, price numeric(8,2) NOT NULL, discontinued boolean NOT NULL DEFAULT false);
INSERT INTO products
SELECT i,
       (ARRAY['lamp','mug','kettle','novel','atlas','puzzle','kite','spade','teapot','chess','yoyo','rake'])[1 + (i * 7) % 12] || '-' || i,
       CASE WHEN i % 11 = 0 THEN NULL ELSE (ARRAY['books','games','kitchen','garden','toys'])[1 + (i * 3) % 5] END,
       round((5 + (i * 37) % 90 + ((i * 13) % 100) / 100.0)::numeric, 2),
       i % 9 = 0
FROM generate_series(1, 24) i;
CREATE TABLE orders (id int PRIMARY KEY, product_id int NOT NULL, qty int NOT NULL);
INSERT INTO orders SELECT i, 1 + (i * 5) % 24, 1 + i % 3 FROM generate_series(1, 16) i;
ANALYZE products; ANALYZE orders;`;

const LOGICAL = `SELECT category, count(*) AS n, round(avg(price), 2) AS avg_price
FROM products
WHERE NOT discontinued
GROUP BY category
HAVING count(*) >= 3
ORDER BY avg_price DESC
LIMIT 3;`;

async function queryFixtures() {
  const { db, q, version } = await fresh();
  await db.exec(PRODUCTS);
  const table = async (sql) => {
    const r = await db.query(sql, [], { rowMode: "array" });
    return { columns: r.fields.map((f) => f.name), rows: r.rows.map((row) => row.map((v) => (v === null ? null : typeof v === "object" ? String(v) : v))) };
  };
  const products = await table(`SELECT * FROM products ORDER BY ctid`);
  const orders = await table(`SELECT * FROM orders ORDER BY ctid`);
  // the logical order, as real prefix queries (what pgtrace @stages captures)
  const where = `WHERE NOT discontinued`;
  const stages = [
    { clause: "FROM", ...(await table(`SELECT * FROM products ORDER BY ctid`)) },
    { clause: "WHERE", ...(await table(`SELECT * FROM products ${where} ORDER BY ctid`)) },
    { clause: "GROUP BY", ...(await table(`SELECT * FROM products ${where} ORDER BY category NULLS LAST, id`)) },
    {
      clause: "HAVING",
      ...(await table(
        `SELECT * FROM products p ${where} AND EXISTS (SELECT 1 FROM (SELECT category FROM products ${where} GROUP BY category HAVING count(*) >= 3) g WHERE g.category IS NOT DISTINCT FROM p.category) ORDER BY category NULLS LAST, id`,
      )),
    },
    { clause: "SELECT", ...(await table(`SELECT category, count(*) AS n, round(avg(price), 2) AS avg_price FROM products ${where} GROUP BY category HAVING count(*) >= 3 ORDER BY category NULLS LAST`)) },
    { clause: "ORDER BY", ...(await table(`SELECT category, count(*) AS n, round(avg(price), 2) AS avg_price FROM products ${where} GROUP BY category HAVING count(*) >= 3 ORDER BY avg_price DESC`)) },
    { clause: "LIMIT", ...(await table(LOGICAL)) },
  ];
  out("stages.json", { engine: version, sql: LOGICAL, setup: PRODUCTS.trim(), stages });

  const explain = async (sql) => (await q(`EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF, FORMAT JSON) ${sql}`))[0]["QUERY PLAN"];
  const plans = {
    logical: { sql: LOGICAL, plan: await explain(LOGICAL) },
    limit: { sql: `SELECT id, name, price FROM products WHERE price > 50 LIMIT 3;`, plan: await explain(`SELECT id, name, price FROM products WHERE price > 50 LIMIT 3`) },
    sorted: { sql: `SELECT id, name, price FROM products WHERE price > 50 ORDER BY price DESC LIMIT 3;`, plan: await explain(`SELECT id, name, price FROM products WHERE price > 50 ORDER BY price DESC LIMIT 3`) },
    join: {
      sql: `SELECT o.id, p.name, o.qty FROM orders o JOIN products p ON p.id = o.product_id WHERE p.price > 30;`,
      plan: await explain(`SELECT o.id, p.name, o.qty FROM orders o JOIN products p ON p.id = o.product_id WHERE p.price > 30`),
    },
  };
  const limitRows = await table(`SELECT id, name, price FROM products WHERE price > 50 LIMIT 3`);
  const sortedRows = await table(`SELECT id, name, price FROM products WHERE price > 50 ORDER BY price DESC LIMIT 3`);
  out("explain.json", { engine: version, products, orders, plans, results: { limit: limitRows, sorted: sortedRows } });

  // joins: two small tables with a duplicate key and a NULL, every join kind, real results
  await db.exec(`
    CREATE TABLE l (id int, name text); INSERT INTO l VALUES (1,'ada'),(2,'linus'),(3,'grace'),(3,'grace2'),(5,'barbara'),(NULL,'nobody');
    CREATE TABLE r (id int, team text); INSERT INTO r VALUES (1,'db'),(3,'web'),(3,'ops'),(4,'ml'),(NULL,'void');`);
  const L = await table(`SELECT * FROM l ORDER BY ctid`);
  const R = await table(`SELECT * FROM r ORDER BY ctid`);
  const kinds = {
    inner: await table(`SELECT l.id, l.name, r.id AS rid, r.team FROM l JOIN r ON l.id = r.id`),
    left: await table(`SELECT l.id, l.name, r.id AS rid, r.team FROM l LEFT JOIN r ON l.id = r.id`),
    right: await table(`SELECT l.id, l.name, r.id AS rid, r.team FROM l RIGHT JOIN r ON l.id = r.id`),
    full: await table(`SELECT l.id, l.name, r.id AS rid, r.team FROM l FULL JOIN r ON l.id = r.id`),
    semi: await table(`SELECT l.id, l.name FROM l WHERE EXISTS (SELECT 1 FROM r WHERE r.id = l.id)`),
    anti: await table(`SELECT l.id, l.name FROM l WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.id = l.id)`),
  };
  out("joins.json", { engine: version, left: { name: "l", ...L }, right: { name: "r", ...R }, on: ["id", "id"], kinds });
  await db.close();
}

async function visibilityFixtures() {
  const { db, q, version } = await fresh();
  await db.exec(`CREATE TABLE v (id int, note text);`);
  await db.exec(`INSERT INTO v VALUES (1, 'committed insert'), (2, 'committed, later deleted'), (3, 'committed, delete rolled back'), (4, 'committed, locked FOR UPDATE'), (5, 'committed, updated by me'), (6, 'committed, deleted by a prepared xact'), (7, 'committed, deleted by me');`);
  await db.exec(`BEGIN; INSERT INTO v VALUES (10, 'aborted insert'); ROLLBACK;`);
  await db.exec(`DELETE FROM v WHERE id = 2;`);
  await db.exec(`BEGIN; DELETE FROM v WHERE id = 3; ROLLBACK;`);
  await db.exec(`BEGIN; INSERT INTO v VALUES (11, 'inserted by a prepared xact'); PREPARE TRANSACTION 'p1';`);
  await db.exec(`BEGIN; DELETE FROM v WHERE id = 6; PREPARE TRANSACTION 'p2';`);
  // the reader: a repeatable read transaction that also writes
  await db.exec(`BEGIN ISOLATION LEVEL REPEATABLE READ;`);
  await q(`SELECT count(*) FROM v`); // takes the snapshot
  await db.exec(`INSERT INTO v VALUES (20, 'inserted by me'); UPDATE v SET note = 'updated by me' WHERE id = 5; DELETE FROM v WHERE id = 7; SELECT * FROM v WHERE id = 4 FOR UPDATE;`);
  await db.exec(`SAVEPOINT s; INSERT INTO v VALUES (21, 'rolled back to savepoint'); ROLLBACK TO SAVEPOINT s;`);
  const snap = parseSnap((await q(`SELECT pg_current_snapshot()::text AS s`))[0].s);
  const me = Number((await q(`SELECT pg_current_xact_id_if_assigned()::text AS x`))[0].x);
  const page = await heapPage(q, "v", 0);
  const xids = [...new Set(page.tuples.flatMap((t) => [t.xmin, t.xmax]).filter((x) => x && x > 2))];
  const xact = {};
  for (const x of xids) xact[x] = (await q(`SELECT pg_xact_status($1::text::xid8) AS s`, [String(x)]))[0].s;
  const visible = (await q(`SELECT ctid::text FROM v ORDER BY ctid`)).map((r) => parseTid(r.ctid));
  await db.exec(`COMMIT`);
  await db.exec(`ROLLBACK PREPARED 'p1'`);
  await db.exec(`ROLLBACK PREPARED 'p2'`);
  out("visibility.json", { engine: version, note: "reader is REPEATABLE READ; xip comes from prepared transactions", snap, me, xact, page, visible });
  await db.close();
}

/** a real single-session trace in the PgTrace shape: update twice, commit, read, move a key, vacuum */
async function miniTrace() {
  const { db, q, version } = await fresh(["autovacuum = off"]);
  const setup = `CREATE TABLE accounts (id int PRIMARY KEY, owner text NOT NULL, balance int NOT NULL);
INSERT INTO accounts VALUES (1, 'ada', 100), (2, 'linus', 50), (3, 'grace', 75);
CHECKPOINT;`;
  await db.exec(setup);
  const filenode = new Map((await q(`SELECT pg_relation_filenode(c.oid)::int AS f, relname FROM pg_class c WHERE relname IN ('accounts', 'accounts_pkey')`)).map((r) => [r.f, r.relname]));
  const lsnNow = async () => parseLsn((await q(`SELECT pg_current_wal_insert_lsn()::text AS l`))[0].l);
  const base = { xid: Number((await q(`SELECT pg_current_xact_id()::text AS x`))[0].x), lsn: await lsnNow() };
  await db.exec(`CHECKPOINT`);
  let walFrom = await lsnNow();
  const [cp] = await q(`SELECT checkpoint_lsn::text, redo_lsn::text FROM pg_control_checkpoint()`);
  const engine = {
    version: (await q(`SHOW server_version`))[0].server_version,
    major: 18,
    blockSize: Number((await q(`SHOW block_size`))[0].block_size),
    walBlockSize: Number((await q(`SHOW wal_block_size`))[0].wal_block_size),
    segSize: 16 * 1024 * 1024,
    checksums: (await q(`SHOW data_checksums`))[0].data_checksums === "on",
    ioMethod: (await q(`SHOW io_method`))[0].io_method,
    build: `PGlite ${JSON.parse(readFileSync(fileURLToPath(new URL("../../../../node_modules/@electric-sql/pglite/package.json", import.meta.url)), "utf8")).version}`,
  };
  const script = [
    { sql: "BEGIN;", note: "T1 opens a transaction. no xid yet: postgres assigns one at the first write." },
    { sql: "UPDATE accounts SET balance = balance + 10 WHERE id = 1;", note: "the first write: T1 gets an xid, the old version gets xmax, a new version goes on the same page." },
    { sql: "UPDATE accounts SET balance = balance + 10 WHERE id = 1;", note: "again: a third version. balance isn't indexed, so these are HOT updates and the index doesn't change." },
    { sql: "COMMIT;", note: "the commit is one WAL record. nothing on the page changes yet." },
    { sql: "SELECT id, balance FROM accounts;", note: "the first reader after the commit checks clog and sets hint bits, which dirties the page." },
    { sql: "UPDATE accounts SET id = 4 WHERE id = 2;", note: "an indexed column changed: not HOT. the index gets a second entry." },
    { sql: "VACUUM accounts;", note: "vacuum prunes the dead versions. the HOT chain's root line pointer becomes a redirect." },
  ];
  const steps = [];
  let inTxn = false;
  for (let i = 0; i < script.length; i++) {
    const { sql, note } = script[i];
    const r = await db.query(sql, [], { rowMode: "array" });
    if (/^BEGIN/i.test(sql)) inTxn = true;
    if (/^(COMMIT|ROLLBACK)/i.test(sql)) inTxn = false;
    const step = { i, session: "T1", sql, note, status: "ok" };
    const cmd = sql.split(/\s/)[0].toUpperCase().replace(";", "");
    step.result = {
      command: cmd,
      rows: r.affectedRows ?? r.rows.length,
      columns: (r.fields ?? []).map((f) => ({ name: f.name, type: f.dataTypeID === 23 ? "int4" : "text" })),
      data: r.rows.map((row) => row.map((v) => (v === null ? null : String(v)))),
    };
    // probes, in pgtrace order: xids, buffers (before page probes read through shared buffers), wal, pages
    const x = (await q(`SELECT pg_current_xact_id_if_assigned()::text AS x, pg_current_snapshot()::text AS s, current_setting('transaction_isolation') AS iso`))[0];
    step.xids = { T1: { xid: x.x ? Number(x.x) : null, snap: inTxn || x.x ? parseSnap(x.s) : null, iso: x.iso, inTxn } };
    const bufs = await q(
      `SELECT bufferid, relfilenode::int AS f, relforknumber, relblocknumber, isdirty, usagecount, pinning_backends FROM pg_buffercache WHERE relfilenode IS NOT NULL ORDER BY bufferid`,
    );
    const mine = bufs.filter((b) => filenode.has(b.f));
    step.buffers = {
      frames: mine.map((b) => ({ id: b.bufferid, rel: filenode.get(b.f), fork: ["main", "fsm", "vm", "init"][b.relforknumber], block: b.relblocknumber, dirty: b.isdirty, usage: b.usagecount, pins: b.pinning_backends })),
      other: bufs.length - mine.length,
      summary: { used: bufs.length, dirty: bufs.filter((b) => b.isdirty).length },
    };
    const to = await lsnNow();
    const flush = parseLsn((await q(`SELECT pg_current_wal_flush_lsn()::text AS l`))[0].l);
    // pg_walinspect only reads flushed WAL. records still in wal_buffers show up in a later probe.
    const readTo = Math.min(to, flush);
    const none = readTo <= walFrom;
    const recs = none
      ? []
      : await q(
          `SELECT start_lsn::text, end_lsn::text, prev_lsn::text, xid::text, resource_manager, record_type, record_length, fpi_length, description FROM pg_get_wal_records_info($1::text::pg_lsn, $2::text::pg_lsn)`,
          [lsnStr(walFrom), lsnStr(readTo)],
        );
    const blocks = none
      ? []
      : await q(`SELECT start_lsn::text, relfilenode::int AS f, relblocknumber::int AS b, block_fpi_length AS fpi_length FROM pg_get_wal_block_info($1::text::pg_lsn, $2::text::pg_lsn)`, [lsnStr(walFrom), lsnStr(readTo)]);
    step.wal = {
      insert: to,
      flush,
      redo: parseLsn(cp.redo_lsn),
      checkpoint: parseLsn(cp.checkpoint_lsn),
      records: recs
        .filter((w) => !(w.resource_manager === "Standby" && w.record_type === "RUNNING_XACTS"))
        .map((w) => ({
          lsn: parseLsn(w.start_lsn),
          end: parseLsn(w.end_lsn),
          prev: parseLsn(w.prev_lsn),
          xid: Number(w.xid),
          rmgr: w.resource_manager,
          type: w.record_type,
          len: w.record_length,
          fpiLen: w.fpi_length,
          desc: (w.description ?? "").replace(/\d{4}-\d\d-\d\d [\d:.]+[+-]\d\d(:\d\d)?;?/g, "").trim(), // commit timestamps are volatile
          blocks: blocks.filter((b) => b.start_lsn === w.start_lsn).map((b) => ({ rel: filenode.get(b.f) ?? "catalog/other", block: b.b, fpi: b.fpi_length > 0 })),
        }))
        // keep what touches the scenario's relations, and commits. catalog hint-bit FPIs (checksums are on) are noise here
        .filter((w) => w.rmgr === "Transaction" || w.blocks.some((b) => b.rel !== "catalog/other")),
    };
    if (recs.length) walFrom = parseLsn(recs[recs.length - 1].end_lsn);
    step.heap = { accounts: await heapPages(q, "accounts") };
    step.btree = { accounts_pkey: await btree(q, "accounts_pkey") };
    step.vm = { accounts: (await q(`SELECT blkno::int AS block, all_visible, all_frozen FROM pg_visibility_map('accounts')`)).map((v) => ({ block: v.block, allVisible: v.all_visible, allFrozen: v.all_frozen })) };
    const xs = [...new Set(step.heap.accounts.flatMap((p) => p.tuples.flatMap((t) => [t.xmin, t.xmax])).filter((v) => v && v > 2))];
    step.xact = {};
    for (const xx of xs) step.xact[xx] = (await q(`SELECT pg_xact_status($1::text::xid8) AS s`, [String(xx)]))[0].s;
    steps.push(step);
  }
  const trace = {
    v: 1,
    scenario: "fixtures/update-twice",
    title: "update twice, commit, read, move a key, vacuum",
    engine,
    server: { autovacuum: "off" },
    sessions: ["T1"],
    rels: {
      accounts: { kind: "table", am: "heap", columns: await columns(q, "accounts") },
      accounts_pkey: { kind: "index", am: "btree" },
    },
    base,
    setup,
    steps,
  };
  out("mini.pgtrace.json", trace);
  await db.close();
}

/** a heap file through delete, vacuum and freeze: per page live / dead / free bytes and VM bits */
async function heapFileFixture() {
  const { db, q, version } = await fresh(["autovacuum = off"]);
  await db.exec(`CREATE TABLE events (id int, payload text)`);
  await db.exec(`INSERT INTO events SELECT i, repeat('x', 60) FROM generate_series(1, 1200) i`);
  const stage = async (label) => {
    const [{ n }] = await q(`SELECT pg_relation_size('events')::int / 8192 AS n`);
    const vm = await q(`SELECT blkno::int AS b, all_visible, all_frozen FROM pg_visibility_map('events')`);
    const pages = [];
    for (let b = 0; b < n; b++) {
      const [h] = await q(`SELECT lower, upper FROM page_header(get_raw_page('events', $1))`, [b]);
      const items = await q(
        `SELECT lp_flags, lp_len, t_xmax::text AS xmax, t_infomask FROM heap_page_items(get_raw_page('events', $1))`,
        [b],
      );
      // a tuple whose xmax committed is dead (nothing else is running here); aligned to 8 bytes like on the page
      const al = (x) => Math.ceil(x / 8) * 8;
      let live = 0, dead = 0;
      for (const it of items) {
        if (it.lp_flags !== 1) continue;
        const deleted = it.xmax !== "0" && !(it.t_infomask & 0x0800) && !(it.t_infomask & 0x0080);
        if (deleted) dead += al(it.lp_len);
        else live += al(it.lp_len);
      }
      const v = vm.find((x) => x.b === b);
      pages.push({ block: b, used: live, dead, free: h.upper - h.lower, allVisible: !!v?.all_visible, allFrozen: !!v?.all_frozen });
    }
    return { label, pages };
  };
  const stages = [];
  stages.push(await stage("INSERT 1,200 rows"));
  await db.exec(`DELETE FROM events WHERE id % 3 <> 0`);
  stages.push(await stage("DELETE two rows in three"));
  await db.exec(`VACUUM events`);
  stages.push(await stage("VACUUM"));
  await db.exec(`VACUUM (FREEZE) events`);
  stages.push(await stage("VACUUM (FREEZE)"));
  await db.exec(`VACUUM FULL events`);
  stages.push(await stage("VACUUM FULL"));
  out("heapfile.json", { engine: version, rel: "events", stages });
  await db.close();
}

const LOCK_MODES = ["ACCESS SHARE", "ROW SHARE", "ROW EXCLUSIVE", "SHARE UPDATE EXCLUSIVE", "SHARE", "SHARE ROW EXCLUSIVE", "EXCLUSIVE", "ACCESS EXCLUSIVE"];

/** the table-level lock conflict matrix, measured: hold mode A in a prepared transaction, ask for mode B with NOWAIT */
async function lockFixture() {
  const { db, version } = await fresh();
  await db.exec(`CREATE TABLE t (id int)`);
  const conflicts = [];
  for (const held of LOCK_MODES) {
    await db.exec(`BEGIN`);
    await db.exec(`LOCK TABLE t IN ${held} MODE`);
    await db.exec(`PREPARE TRANSACTION 'holder'`);
    const row = [];
    for (const want of LOCK_MODES) {
      await db.exec(`BEGIN`);
      try {
        await db.exec(`LOCK TABLE t IN ${want} MODE NOWAIT`);
        row.push(false);
      } catch (e) {
        if (e.code !== "55P03") throw e;
        row.push(true);
      }
      await db.exec(`ROLLBACK`);
    }
    conflicts.push(row);
    await db.exec(`ROLLBACK PREPARED 'holder'`);
  }
  out("locks.json", { engine: version, how: "held in a prepared transaction, requested with NOWAIT (55P03 = conflict)", modes: LOCK_MODES, conflicts });
  await db.close();
}

const lsnStr = (n) => `${Math.floor(n / 2 ** 32).toString(16).toUpperCase()}/${(n % 2 ** 32).toString(16).toUpperCase()}`;

const only = process.argv[2];
const jobs = { hash: hashFixtures, btree: btreeFixtures, query: queryFixtures, visibility: visibilityFixtures, mini: miniTrace, heapfile: heapFileFixture, locks: lockFixture };
try {
  for (const [k, f] of Object.entries(jobs)) if (!only || only === k) await f();
} catch (e) {
  console.error(`failed: ${e.message}${e.query ? `\n  in: ${e.query}` : ""}`);
  process.exit(1);
}
