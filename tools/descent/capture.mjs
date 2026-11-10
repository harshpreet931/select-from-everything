#!/usr/bin/env node
// captures every artifact on the home page's descent ("one query, all the way down") from one
// PGlite instance seeded with the `shop` dataset, through public/sql/engine.js: the same engine,
// the same seeding and the same statement runner the browser uses. writes
// src/components/home/descent.json, which layers.tsx renders. nothing on the descent is typed
// by hand.
//
//   node tools/descent/capture.mjs            write it (runs twice first: the two runs must match)
//   node tools/descent/capture.mjs --check    fail if the committed json is stale
//
// the statements run in order on one instance. layers 9 and 10 change data, so they run last.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as engine from "../../public/sql/engine.js";
import { loadNodeEngine, openSnapshot, readDataset, sitePin } from "../../scripts/lib/datasets.mjs";
import { splitSql } from "../../src/lib/sql/shared/split.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "src/components/home/descent.json");

export const QUERY = "SELECT name FROM customers WHERE id = 42;";

/** what the reader would put in an ext= prelude. not shown on the page. */
const PRELUDE = ["CREATE EXTENSION pageinspect;", "CREATE EXTENSION pg_buffercache;", "CREATE EXTENSION pg_walinspect;"];

async function capture() {
  const e = await loadNodeEngine();
  const ds = readDataset("shop");
  const seeded = await engine.seedDataset(e.PGlite, e.protocol, ds, { extensions: e.extensions, modules: e.modules });
  const db = await openSnapshot(seeded.snapshot);
  const out = { engine: seeded.engine, dataset: "shop", query: QUERY, steps: {} };

  /** run sql (one or more statements) and keep the results under `name` */
  const run = async (name, sql, { keep = true } = {}) => {
    const { results } = await engine.runStatements(db, e.protocol, splitSql(sql), { errors: "continue", maxRows: 50, types: seeded.types });
    const slim = results.map((r) => {
      const s = { sql: r.sql, tag: r.tag };
      if (r.columns) s.columns = r.columns.map((c) => c.name);
      if (r.columns) s.rows = r.rows;
      if (r.notices?.length) s.notices = r.notices.map((n) => ({ severity: n.severity, message: n.message, ...(n.detail ? { detail: n.detail } : {}) }));
      if (r.error) s.error = { sqlstate: r.error.sqlstate, message: r.error.message, ...(r.error.position ? { position: r.error.position } : {}) };
      return s;
    });
    if (keep) out.steps[name] = slim.length === 1 ? slim[0] : slim;
    return slim;
  };
  const one = (name) => {
    const s = out.steps[name];
    return Array.isArray(s) ? s[s.length - 1] : s;
  };

  try {
    await run("prelude", PRELUDE.join("\n"), { keep: false });

    // 0 your query
    await run("query", QUERY);

    // 1 the parser
    await run("keywords", "SELECT word, catdesc FROM pg_get_keywords() WHERE word IN ('select','name','from','where') ORDER BY word;");
    await run("typo", "SELECT name FORM customers WHERE id = 42;");

    // 2 the analyzer: the query tree, after names became numbers
    const tree = await run("parseTree", `SET client_min_messages = log;\nSET debug_print_parse = on;\n${QUERY}\nRESET debug_print_parse;\nRESET client_min_messages;`, {
      keep: false,
    });
    const detail = tree.flatMap((r) => r.notices ?? []).find((n) => /parse tree/.test(n.message))?.detail ?? "";
    out.steps.parseTree = {
      sql: `SET client_min_messages = log;\nSET debug_print_parse = on;\n${QUERY}`,
      message: "parse tree:",
      lines: pickTree(detail),
      chars: detail.length,
    };
    await run(
      "catalog",
      "SELECT 'customers'::regclass::oid, attnum, atttypid FROM pg_attribute WHERE attrelid = 'customers'::regclass AND attname = 'name';",
    );

    // 3 the planner
    await run("plan", `EXPLAIN ${QUERY}`);
    await run("seqPlan", `SET enable_indexscan = off;\nSET enable_bitmapscan = off;\nEXPLAIN ${QUERY}\nRESET enable_indexscan;\nRESET enable_bitmapscan;`);
    const cost = (r) => Number(/cost=[\d.]+\.\.([\d.]+)/.exec(r.rows[0][0])[1]);
    const seq = out.steps.seqPlan.find((r) => r.columns);
    out.steps.ratio = Math.round(cost(seq) / cost(one("plan")));

    // 4 the executor
    await run("analyze", `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF) ${QUERY}`);

    // 5 the index
    await run("meta", "SELECT root, level FROM bt_metap('customers_pkey');");
    const root = Number(one("meta").rows[0][0]);
    await run("root", `SELECT itemoffset, ctid, data FROM bt_page_items('customers_pkey', ${root});`);
    // the leaf whose range holds 42: the last downlink whose key is <= 42 (the first item has no key)
    const key = (hex) => (hex ? new DataView(Uint8Array.from(hex.split(" ").map((h) => parseInt(h, 16))).buffer).getInt32(0, true) : -Infinity);
    let leaf = null;
    for (const [, ctid, data] of one("root").rows) if (key(data) <= 42) leaf = Number(/\((\d+),/.exec(ctid)[1]);
    out.steps.leafBlock = leaf;
    await run("leaf", `SELECT itemoffset, ctid, data FROM bt_page_items('customers_pkey', ${leaf}) WHERE data = '2a 00 00 00 00 00 00 00';`);

    // 6 the buffer pool: evict both relations (new in 18), then the same query twice
    await run("evict", "SELECT * FROM pg_buffercache_evict_relation('customers');\nSELECT * FROM pg_buffercache_evict_relation('customers_pkey');");
    await run("cold", `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF) ${QUERY}`);
    await run("warm", `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF) ${QUERY}`);
    await run(
      "frames",
      "SELECT pg_filenode_relation(0, relfilenode)::regclass AS rel, relblocknumber AS block, usagecount AS usage, isdirty AS dirty FROM pg_buffercache WHERE relfilenode IN (pg_relation_filenode('customers'), pg_relation_filenode('customers_pkey')) ORDER BY 1, 2;",
    );

    // 7 the page
    await run("header", "SELECT lower, upper, special FROM page_header(get_raw_page('customers', 0));");
    await run(
      "tuple",
      "SELECT lp, lp_off, lp_len, t_xmin, t_xmax, t_ctid, t_hoff, (heap_tuple_infomask_flags(t_infomask, t_infomask2)).raw_flags FROM heap_page_items(get_raw_page('customers', 0)) WHERE lp = 42;",
    );

    // 8 the bytes
    await run("filepath", "SELECT pg_relation_filepath('customers');");
    await run("headerBytes", "SELECT encode(substr(get_raw_page('customers', 0), 1, 24), 'hex');");
    await run(
      "tupleBytes",
      "SELECT encode(substr(get_raw_page('customers', 0), lp_off + 1, lp_len), 'hex') FROM heap_page_items(get_raw_page('customers', 0)) WHERE lp = 42;",
    );

    // 9 and the WAL
    const [[before]] = (await run("lsnBefore", "SELECT pg_current_wal_insert_lsn();")).map((r) => r.rows[0]);
    out.steps.lsnBefore = before;
    await run("update", "UPDATE customers SET city = 'Paris' WHERE id = 42;");
    await run(
      "wal",
      `SELECT start_lsn, resource_manager, record_type, record_length, fpi_length FROM pg_get_wal_records_info('${before}', pg_current_wal_insert_lsn());`,
    );
    await run("relnames", "SELECT pg_relation_filenode(c)::text, c::text FROM unnest(ARRAY['customers'::regclass, 'customers_pkey', 'customers_email_key']) c;");
    await run("walBlocks", `SELECT start_lsn, block_ref FROM pg_get_wal_records_info('${before}', pg_current_wal_insert_lsn());`);

    // 10 and the old version
    const lp42 = "SELECT lp, lp_flags, t_xmax, t_ctid FROM heap_page_items(get_raw_page('customers', 0)) WHERE lp = 42;";
    await run("oldVersion", lp42);
    await run("vacuum", "VACUUM customers;");
    await run("afterVacuum", lp42);
  } finally {
    await db.close();
  }
  return out;
}

/** the parts of the query tree the descent shows: the range table entry and the target entry */
function pickTree(detail) {
  const flat = detail.replace(/\s+/g, " ");
  const grab = (re) => re.exec(flat)?.[0]?.trim() ?? null;
  return [
    grab(/:relid \d+/),
    grab(/:eref \{ALIAS :aliasname customers :colnames \([^)]*\)\s*\}/) ?? grab(/:eref \{ALIAS :aliasname customers[^}]*\}/),
    grab(/\{VAR :varno 1 :varattno 2 :vartype 25 [^}]*?:location \d+\s*\}/) ?? grab(/\{VAR :varno 1 :varattno 2 :vartype 25/),
    grab(/:resname name/),
  ].filter(Boolean);
}

const check = process.argv.includes("--check");
const pin = sitePin();
const a = await capture();
if (!a.engine.includes(pin.version) || !a.engine.includes(pin.pglite)) {
  console.error(`descent: engine is "${a.engine}", the site pins postgres ${pin.version} / PGlite ${pin.pglite}`);
  process.exit(3);
}
const text = `${JSON.stringify(a, null, 1)}\n`;
if (check) {
  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (old !== text) {
    console.error("✗ src/components/home/descent.json is stale: node tools/descent/capture.mjs");
    process.exit(1);
  }
  console.log("✓ descent.json matches a fresh capture");
} else {
  const b = await capture();
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error("✗ two captures differ; the descent must be deterministic");
    for (const k of Object.keys(a.steps)) if (JSON.stringify(a.steps[k]) !== JSON.stringify(b.steps[k])) console.error(`  ${k}`);
    process.exit(1);
  }
  fs.writeFileSync(OUT, text);
  console.log(`✓ src/components/home/descent.json (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB, same twice)`);
}
