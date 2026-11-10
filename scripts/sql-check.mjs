#!/usr/bin/env node
// pnpm sql-check [paths…] [--update] [--engine=pglite|native] [--twice] [--only=<file:line|id>] [--jobs=N] [--strict] [--json]
//
// runs every ```sql block with run (or hidden, in a session chain) on PGlite in node, through
// public/sql/engine.js: the same code, the same dataset snapshots and the same statement splitter
// as the browser. compares each block with its golden (content/<part>/<chapter>.golden.json) and
// lints what came back. the playground examples (src/components/play/examples/*.sql) are checked
// the same way, into src/components/play/examples.gen.json.
//
//   --update        write goldens for new or changed blocks (each one run twice on fresh copies first:
//                   output that differs between two runs is refused unless the block says volatile).
//                   unchanged blocks keep their golden byte for byte; goldens of deleted blocks go.
//   --engine=native the same blocks on a throwaway native postgres 18 (scripts/lib/native-pg.mjs):
//                   differences from the goldens are warnings (errors with --strict); `native` blocks
//                   run only here, must match, and --update writes their goldens.
//   --twice         run everything twice on fresh copies and fail on any difference
//   --only=x        one block: content/a/b.mdx:42 (the fence's line) or a block id. its chain still runs
//   --jobs=N        worker threads (default min(4, cpus / 2))
//   --strict        warnings fail too
//   --json          machine-readable report on stdout
//
// exit 0 ok, 1 failures, 2 usage, 3 engine missing or pinned version mismatch.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { listDatasets, loadNodeEngine, openSnapshot, pgliteVersion, readDataset, root, sitePin } from "./lib/datasets.mjs";
import { examplesDir, examplesGolden, exampleBlocks, goldenPathFor, sqlBlocksOf } from "./lib/mdx-sql.mjs";
import { unifiedDiff } from "./lib/diff.mjs";
import { splitSql, maskSql, topLevelSql } from "../src/lib/sql/shared/split.mjs";
import { canonicalStatement, digest, MASKS, toPsql } from "../src/lib/sql/shared/format.mjs";
import { sqlCantRun } from "../src/lib/sql/shared/support.mjs";
import * as engine from "../public/sql/engine.js";

const USAGE =
  "usage: pnpm sql-check [paths…] [--update] [--engine=pglite|native] [--twice] [--only=<file:line|id>] [--jobs=N] [--strict] [--json]";
const GOLDEN_ROWS = 50;
const MAX_ROWS = 1000;
const MAX_BYTES = 2_000_000;
const rel = (p) => path.relative(root, p);

/* ---- options ------------------------------------------------------------------------------ */

function parseArgs(argv) {
  const o = { paths: [], update: false, engine: "pglite", twice: false, only: null, jobs: null, strict: false, json: false };
  for (const a of argv) {
    if (a === "--update") o.update = true;
    else if (a === "--twice") o.twice = true;
    else if (a === "--strict") o.strict = true;
    else if (a === "--json") o.json = true;
    else if (a.startsWith("--engine=")) o.engine = a.slice(9);
    else if (a.startsWith("--only=")) o.only = a.slice(7);
    else if (a.startsWith("--jobs=")) o.jobs = Number(a.slice(7));
    else if (a.startsWith("--")) return null;
    else o.paths.push(a);
  }
  if (!["pglite", "native"].includes(o.engine)) return null;
  if (o.jobs !== null && !(Number.isInteger(o.jobs) && o.jobs > 0)) return null;
  return o;
}

/* ---- datasets, per thread ------------------------------------------------------------------ */

const datasetNames = listDatasets();
const setupsByDb = Object.fromEntries(datasetNames.map((n) => [n, Object.keys(readDataset(n).setups)]));
const metaOpts = { datasets: datasetNames, setups: setupsByDb };

/* ---- engines -------------------------------------------------------------------------------- */

/** PGlite in node: one snapshot per dataset per thread, a fresh copy per chain */
function pgliteAdapter() {
  const snaps = new Map();
  let e = null;
  return {
    name: null,
    async snapshot(db) {
      e ??= await loadNodeEngine();
      if (!snaps.has(db)) {
        const ds = readDataset(db);
        const p = engine.seedDataset(e.PGlite, e.protocol, ds, { extensions: e.extensions, modules: e.modules }).then((s) => ({ ...s, ds }));
        snaps.set(db, p);
      }
      const s = await snaps.get(db);
      this.name = s.engine;
      return s;
    },
    async open(db) {
      const s = await this.snapshot(db);
      const conn = await openSnapshot(s.snapshot);
      return {
        engine: s.engine,
        setup: (ext, setup) =>
          engine.runSetup(conn, e.protocol, { ext, setup: setup.map((name) => ({ name, statements: s.ds.setups[name] ?? [] })) }),
        run: (stmts, errors) => engine.runStatements(conn, e.protocol, stmts, { errors, maxRows: MAX_ROWS, maxBytes: MAX_BYTES, types: s.types }),
        resolveTypes: async (results, unknown) => {
          if (!unknown.size) return;
          const names = await engine.resolveTypes(conn, e.protocol, [...unknown]);
          for (const r of results) for (const c of r.columns ?? []) if (names[c.oid]) c.type = names[c.oid];
        },
        close: () => conn.close(),
      };
    },
  };
}

/** a throwaway native postgres 18: datasets become template databases, each chain gets a copy */
async function nativeAdapter() {
  const need = ["scripts/lib/native-pg.mjs", "scripts/lib/collect-pg.mjs"];
  for (const f of need) if (!fs.existsSync(path.join(root, f))) throw new Error(`--engine=native needs ${f}`);
  const native = await import("./lib/native-pg.mjs");
  const collect = await import("./lib/collect-pg.mjs");
  const pg = native.findPg();
  const cluster = await native.startCluster({ pg, settings: native.BASE_SETTINGS });
  const admin = await cluster.connect();
  const ready = new Map();
  let n = 0;
  const arrays = (results) => {
    for (const r of results) for (const c of r.columns ?? []) if (/^_/.test(c.type)) c.type = `${c.type.slice(1)}[]`;
  };
  const cut = (results) => {
    for (const r of results)
      r.rows = r.rows.map((row) => row.map((v) => (typeof v === "string" && v.length > 10_000 ? `${v.slice(0, 10_000)} …(${v.length.toLocaleString("en-US")} chars)` : v)));
  };
  return {
    name: `PostgreSQL ${pg.version} (native)`,
    async template(db) {
      if (!ready.has(db)) {
        ready.set(
          db,
          (async () => {
            const ds = readDataset(db);
            const name = `ds_${db}`;
            await admin.query(`CREATE DATABASE ${name}`);
            const c = await cluster.connect({ database: name });
            try {
              const body = [...ds.extensions.map((x) => `CREATE EXTENSION ${x};`), ...ds.statements];
              if (body.length) {
                await c.query("BEGIN");
                for (const sql of body) await c.query(sql);
                await c.query("COMMIT");
              }
              if (ds.analyze) await c.query("VACUUM (ANALYZE)");
              await c.query("CHECKPOINT");
            } finally {
              await c.end();
            }
            await admin.query(`ALTER DATABASE ${name} WITH is_template = true`);
            return ds;
          })(),
        );
      }
      return ready.get(db);
    },
    async open(db) {
      const ds = await this.template(db);
      const name = `chain_${++n}`;
      await admin.query(`CREATE DATABASE ${name} TEMPLATE ds_${db}`);
      const c = await cluster.connect({ database: name });
      await collect.loadBuiltinTypes(c);
      return {
        engine: this.name,
        setup: async (ext, setup) => {
          const fixed = [...ext.map(engine.extSql), ...setup.flatMap((s) => ds.setups[s] ?? [])];
          for (const sql of fixed) {
            const r = await collect.runStatement(c, sql);
            if (r.error) return { setupError: { ...r.error, sql } };
          }
          return {};
        },
        run: async (stmts, errors) => {
          const out = await collect.runStatements(c, stmts, { errors, maxRows: MAX_ROWS, maxBytes: MAX_BYTES });
          arrays(out.results);
          cut(out.results);
          return { ...out, unknownTypes: new Set() };
        },
        resolveTypes: async (results) => {
          await collect.resolveTypes(c, results);
          arrays(results);
        },
        close: async () => {
          await c.end();
          await admin.query(`DROP DATABASE ${name}`);
        },
      };
    },
    async destroy() {
      await admin.end().catch(() => {});
      await cluster.destroy();
    },
  };
}

/* ---- goldens ---------------------------------------------------------------------------------- */

const flagsOf = (b) => ({ unordered: !!b.flags.unordered, volatile: !!b.flags.volatile });

function goldenStatement(s, flags) {
  /** @type {Record<string, unknown>} */
  const g = {
    tag: s.tag,
    command: s.command,
    columns: s.columns ? s.columns.map((c) => [c.name, c.type, c.oid]) : null,
    rowCount: s.rowCount,
  };
  if (s.notices.length) g.notices = s.notices;
  if (s.error) g.error = s.error;
  if (s.copyOut !== undefined) g.copyOut = trimCopy(s.copyOut);
  if (s.truncated) g.truncated = s.truncated;
  g.digest = digest(canonicalStatement(s, flags, MASKS.timing));
  if (s.columns) g.rows = s.rows.slice(0, GOLDEN_ROWS);
  return g;
}

function goldenBlock(b, view, engineName) {
  /** @type {Record<string, unknown>} */
  const g = {
    db: b.db,
    sql: b.sql,
    statements: view.statements.map((s) => goldenStatement(s, flagsOf(b))),
    error: view.error ?? null,
    txn: view.txn ?? "I",
  };
  if (engineName) g.engine = engineName;
  return g;
}

const trimCopy = (text) => {
  const lines = text.split("\n");
  return lines.length > GOLDEN_ROWS + 1 ? lines.slice(0, GOLDEN_ROWS).join("\n") + "\n" : text;
};

/** what a golden keeps of a statement: 50 rows (saying how many there were), 50 lines of COPY output */
const cut = (s) => {
  const all = s.rows ?? [];
  const rows = all.slice(0, GOLDEN_ROWS);
  const total = s.truncated?.total ?? s.rowCount ?? all.length;
  const out = { ...s, rows, notices: s.notices ?? [], truncated: s.columns && total !== null && total > rows.length ? { kept: rows.length, total } : undefined };
  if (s.copyOut !== undefined) out.copyOut = trimCopy(s.copyOut);
  return out;
};

/** a golden as statements, for comparing and for psql-style diffs */
function goldenStatements(g, b) {
  const stmts = splitSql(b.sql);
  return g.statements.map((s, i) =>
    cut({
      i,
      sql: stmts[i]?.sql ?? "",
      offset: 0,
      command: s.command,
      tag: s.tag,
      rowCount: s.rowCount,
      columns: s.columns ? s.columns.map(([name, type, oid]) => ({ name, type, oid, typmod: -1 })) : null,
      rows: s.rows,
      truncated: s.truncated,
      copyOut: s.copyOut,
      notices: s.notices,
      error: s.error,
      ms: 0,
    }),
  );
}

const trimView = (statements) => statements.map(cut);

/**
 * does a run match its golden? the digest of each full statement (timing masked) and the rows the
 * golden kept, so an edited golden fails too. other masks (native): only what the golden kept.
 */
function matches(b, view, g, mask) {
  if (!g) return false;
  if (g.statements.length !== view.statements.length || (g.txn ?? "I") !== (view.txn ?? "I")) return false;
  if (mask === MASKS.timing && !view.statements.every((s, i) => digest(canonicalStatement(s, flagsOf(b), mask)) === g.statements[i].digest)) {
    return false;
  }
  const gs = goldenStatements(g, b);
  const as = trimView(view.statements);
  return as.every((s, i) => canonicalStatement(s, flagsOf(b), mask) === canonicalStatement(gs[i], flagsOf(b), mask));
}

const psqlOf = (statements) => statements.map(toPsql).join("\n\n") + `\n`;

/** compact but diffable json: arrays of plain values on one line, everything else one key per line */
function stringify(v, indent = "") {
  const inner = indent + "  ";
  const flat = (x) => x === null || typeof x !== "object" || (Array.isArray(x) && x.every((y) => y === null || typeof y !== "object"));
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    if (v.every(flat)) {
      const one = v.map((x) => (Array.isArray(x) ? `[${x.map((y) => JSON.stringify(y)).join(", ")}]` : JSON.stringify(x)));
      if (v.every((x) => !Array.isArray(x))) return `[${one.join(", ")}]`;
      return `[\n${one.map((x) => inner + x).join(",\n")}\n${indent}]`;
    }
    return `[\n${v.map((x) => inner + stringify(x, inner)).join(",\n")}\n${indent}]`;
  }
  const keys = Object.keys(v).filter((k) => v[k] !== undefined);
  if (!keys.length) return "{}";
  return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${stringify(v[k], inner)}`).join(",\n")}\n${indent}}`;
}

/* ---- lints ------------------------------------------------------------------------------------ */

const VOLATILE_FN =
  /\b(now|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday|random|random_normal|gen_random_uuid|uuidv4|uuidv7|txid_current|pg_backend_pid|inet_client_port)\s*\(|\b(current_timestamp|current_time|current_date|localtimestamp|localtime)\b/i;
const AGG = /\b(string_agg|array_agg|json_agg|jsonb_agg|json_object_agg|jsonb_object_agg|xmlagg)\s*\(/gi;

/** the text inside the parentheses that open at `open` (masked sql) */
function parenBody(m, open) {
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    if (m[i] === "(") depth++;
    else if (m[i] === ")" && --depth === 0) return m.slice(open + 1, i);
  }
  return m.slice(open + 1);
}

/** EXECUTE name: the prepared query's top level, from a PREPARE earlier in the chain or block */
function preparedTop(sql, text) {
  const ex = /^\s*EXECUTE\s+("?)([\w$]+)\1/i.exec(maskSql(sql));
  if (!ex) return null;
  const name = ex[2].toLowerCase();
  let found = null;
  for (const st of splitSql(text)) {
    const m = /^\s*PREPARE\s+("?)([\w$]+)\1\s*(?:\([^)]*\))?\s+AS\b/i.exec(maskSql(st.sql));
    if (m && m[2].toLowerCase() === name) found = st.sql.slice(m[0].length);
  }
  return found == null ? null : topLevelSql(found);
}

// identity functions: the same in every run once you only compare with them (WHERE pid = pg_backend_pid())
const COMPARED_ONLY = /^(pg_backend_pid|inet_client_port)$/i;
const compared = (m, at, len) => /(=|<>|!=|<|>|\bIN\s*\()\s*$/i.test(m.slice(Math.max(0, at - 12), at)) || /^\s*\)?\s*(=|<>|!=|<|>)/.test(m.slice(at + len, at + len + 6));

function lint(b, view, ms, chainSoFar) {
  const errs = [];
  const warns = [];
  const masked = maskSql(b.sql);
  for (const s of view.statements) {
    const n = s.rowCount ?? s.rows.length;
    const top = preparedTop(s.sql, chainSoFar + "\n" + b.sql) ?? topLevelSql(s.sql);
    if (s.columns && n >= 2 && !b.flags.unordered) {
      if (s.command === "SELECT" && !/\bORDER\s+BY\b/i.test(top)) {
        errs.push(`statement ${s.i + 1} returns ${n} rows with no ORDER BY, so their order isn't guaranteed. add one, or mark the block unordered`);
      } else if (/^(INSERT|UPDATE|DELETE|MERGE)$/.test(s.command)) {
        warns.push(`statement ${s.i + 1}: RETURNING gives ${n} rows in an order nobody promised. mark the block unordered if it can change`);
      }
    }
    const ms2 = maskSql(s.sql);
    if (/^\s*EXPLAIN\b/i.test(ms2) && /\bANALY[SZ]E\b/i.test(ms2) && !/\bTIMING\s+(OFF|FALSE|0)\b/i.test(ms2)) {
      warns.push(`statement ${s.i + 1}: EXPLAIN ANALYZE without TIMING OFF prints wall-clock times (masked in the golden, different for every reader)`);
    }
    // only statements that return rows: a DELETE's count is a tag, not a result the page has to show
    if (s.columns && (s.truncated || n > MAX_ROWS)) warns.push(`statement ${s.i + 1} returns ${n.toLocaleString("en-US")} rows; the page shows ${MAX_ROWS.toLocaleString("en-US")} at most`);
  }
  if (!b.flags.volatile) {
    const all = new RegExp(VOLATILE_FN.source, "gi");
    const m = [...masked.matchAll(all)].find((x) => {
      const fn = x[1] ?? "";
      if (!COMPARED_ONLY.test(fn)) return true;
      // pg_backend_pid() ( ) : the call ends after its parentheses
      const close = masked.indexOf(")", x.index + x[0].length);
      return !compared(masked, x.index, (close < 0 ? x[0].length : close + 1 - x.index));
    });
    if (m) {
      const seeded = /\bsetseed\s*\(/i.test(maskSql(chainSoFar + "\n" + b.sql)) && /^random/i.test(m[1] ?? "");
      const showsRows = view.statements.some((s) => s.columns);
      if (!seeded) (showsRows ? errs : warns).push(`${m[0].replace(/\s*\($/, "()")} changes every run. mark the block volatile, or don't print it`);
    }
  }
  for (const a of masked.matchAll(AGG)) {
    const body = parenBody(masked, a.index + a[0].length - 1);
    if (!/\bORDER\s+BY\b/i.test(body)) warns.push(`${a[1]}() without ORDER BY inside: the order of the result isn't guaranteed`);
  }
  if (ms > 2000) warns.push(`took ${(ms / 1000).toFixed(1)} s; keep blocks under 2 s`);
  const errored = view.statements.filter((s) => s.error);
  const last = view.statements[view.statements.length - 1];
  if (b.flags.expect === "error" && !last?.error) errs.push("expect=error, but the block ended without an error");
  if (errored.length && b.flags.expect !== "error" && b.flags.errors !== "continue") {
    const e = errored[0].error;
    errs.push(`statement ${errored[0].i + 1} failed: ERROR ${e.sqlstate}: ${e.message}. mark the block expect=error if that's the point`);
  }
  return { errs, warns };
}

/* ---- one file -------------------------------------------------------------------------------- */

async function runChain(adapter, chain) {
  const first = chain[0];
  const conn = await adapter.open(first.db);
  const out = [];
  try {
    const s = await conn.setup(first.ext, first.setup);
    if (s.setupError) return { setupError: s.setupError, out };
    const unknown = new Set();
    for (const b of chain) {
      const stmts = splitSql(b.sql).map((x) => ({ sql: x.sql, offset: x.offset }));
      const t0 = performance.now();
      const r = await conn.run(stmts, b.flags.errors ?? "stop");
      const ms = performance.now() - t0;
      for (const t of r.unknownTypes ?? []) unknown.add(t);
      const view = { statements: r.results, txn: r.txn };
      const firstErr = r.results.find((x) => x.error);
      if (firstErr) view.error = { ...firstErr.error, statement: firstErr.i };
      out.push({ block: b, view, ms });
    }
    await conn.resolveTypes(
      out.flatMap((o) => o.view.statements),
      unknown,
    );
    return { out };
  } finally {
    await conn.close();
  }
}

function chainsOf(blocks) {
  const chains = [];
  const bySession = new Map();
  for (const b of blocks) {
    if (b.session) {
      let c = bySession.get(b.session);
      if (!c) {
        c = [];
        bySession.set(b.session, c);
        chains.push(c);
      }
      c.push(b);
    } else chains.push([b]);
  }
  return chains;
}

const sameCanon = (a, b, block) =>
  a.statements.length === b.statements.length &&
  a.statements.every((s, i) => canonicalStatement(s, flagsOf(block), MASKS.timing) === canonicalStatement(b.statements[i], flagsOf(block), MASKS.timing)) &&
  a.txn === b.txn;

/**
 * check one unit: an mdx file (golden next to it) or the playground examples (one golden for all)
 * @returns {Promise<{ file: string; blocks: number; errors: { line: number; msg: string; diff?: string }[]; warnings: { line: number; msg: string }[]; notes: string[] }>}
 */
async function checkUnit(unit, opts, adapter) {
  const res = { file: unit.label, blocks: 0, errors: [], warnings: [], notes: [] };
  const err = (line, msg, diff) => res.errors.push({ line, msg, ...(diff ? { diff } : {}) });
  const warn = (line, msg) => res.warnings.push({ line, msg });

  let blocks;
  let goldenPath;
  let goldenRaw = null;
  /** @type {{ v: number; engine: string; blocks: Record<string, any> } | null} */
  let golden = null;
  if (unit.kind === "mdx") {
    blocks = sqlBlocksOf(fs.readFileSync(unit.file, "utf8"), metaOpts);
    goldenPath = goldenPathFor(unit.file);
  } else {
    blocks = exampleBlocks(unit.files, metaOpts);
    goldenPath = path.join(root, examplesGolden);
  }
  if (fs.existsSync(goldenPath)) {
    goldenRaw = fs.readFileSync(goldenPath, "utf8");
    try {
      const parsed = JSON.parse(goldenRaw);
      golden =
        unit.kind === "mdx"
          ? parsed
          : { v: parsed.v, engine: parsed.engine, blocks: Object.fromEntries((parsed.examples ?? []).filter((x) => x.golden).map((x) => [x.blockId, x.golden])) };
    } catch (e) {
      err(0, `${rel(goldenPath)} isn't valid json (${e.message}). delete it and run pnpm sql-check --update ${unit.label}`);
    }
  }
  const sqlBlocks = blocks.filter((b) => b.run || b.hidden || b.native);
  // never run what the browser can't: COPY ... FROM STDIN, for one, takes the whole engine down
  for (const b of sqlBlocks) {
    const why = (b.run || b.hidden) && sqlCantRun(b.sql);
    if (why) b.issues.push(`the browser engine can't run this (${why}). use native instead of run`);
  }
  for (const b of blocks) for (const i of b.issues) err(b.line, i);
  if (!sqlBlocks.length && !golden) return res;

  const native = opts.engine === "native";
  // a chain with a broken block can't run: its later blocks depend on it
  const runnable = sqlBlocks.filter((b) => !b.nocheck && (native || !b.native));
  const chains = chainsOf(runnable).filter((c) => {
    const bad = c.find((b) => b.issues.length);
    if (bad && c.length > 1) err(c[0].line, `session "${c[0].session}" isn't checked until the block on line ${bad.line} is fixed`);
    return !bad;
  });
  const only = (b) =>
    !opts.only ||
    opts.only === b.id ||
    (opts.only.includes(":") && path.resolve(root, opts.only.split(":")[0]) === path.resolve(root, unit.file ?? "") && Number(opts.only.split(":").pop()) === b.line);
  for (const b of sqlBlocks) if (b.nocheck && only(b)) res.notes.push(`line ${b.line}: nocheck, not run here`);
  if (opts.only && unit.kind === "mdx" && opts.only.includes(":") && !sqlBlocks.some(only)) {
    err(0, `no run, hidden or native sql block starts on line ${opts.only.split(":").pop()} (fence lines: ${sqlBlocks.map((b) => b.line).join(", ")})`);
  }

  const engineName = await (async () => {
    if (native) return adapter.name;
    await adapter.snapshot(chains[0]?.[0]?.db ?? "empty");
    return adapter.name;
  })();
  if (!native && golden && golden.engine !== engineName && !opts.update) {
    err(0, `the goldens were recorded on ${golden.engine}, this is ${engineName}. engine changed: run pnpm sql-check --update ${unit.label} and review the diff`);
    return res;
  }

  /** id → { block, view } of this run */
  const results = new Map();
  let chainText = "";
  for (const chain of chains) {
    if (opts.only && !chain.some(only)) continue;
    let first;
    try {
      first = await runChain(adapter, chain);
    } catch (e) {
      err(chain[0].line, `the engine failed: ${e.message}`);
      continue;
    }
    if (first.setupError) {
      err(chain[0].line, `setup failed (${first.setupError.sqlstate}: ${first.setupError.message}) in: ${first.setupError.sql.slice(0, 120)}`);
      continue;
    }
    // determinism: a second run on a fresh copy must say the same
    const fresh = opts.twice || (opts.update && chain.some((b) => (b.run || b.native) && !matches(b, first.out.find((o) => o.block === b).view, golden?.blocks?.[b.id], MASKS.timing)));
    let second = null;
    if (fresh) {
      try {
        second = await runChain(adapter, chain);
      } catch (e) {
        err(chain[0].line, `the engine failed on the second run: ${e.message}`);
      }
    }
    chainText = "";
    for (const o of first.out) {
      const b = o.block;
      results.set(b.id, o);
      res.blocks++;
      if (only(b)) {
        const { errs, warns } = lint(b, o.view, o.ms, chainText);
        for (const m of errs) err(b.line, m);
        for (const m of warns) warn(b.line, m);
        const again = second?.out.find((x) => x.block === b);
        if (again && !b.flags.volatile && !sameCanon(o.view, again.view, b)) {
          err(b.line, "two runs on fresh copies gave different output. mark the block volatile if that's expected", unifiedDiff(psqlOf(o.view.statements), psqlOf(again.view.statements)));
          o.unstable = true;
        }
      }
      chainText += "\n" + b.sql;
    }
  }

  // compare with goldens, and build the new golden file
  const wanted = sqlBlocks.filter((b) => (b.run || b.native) && !b.nocheck && !b.issues.length);
  const next = {};
  let wrote = 0;
  let kept = 0;
  for (const b of wanted) {
    const g = golden?.blocks?.[b.id];
    const r = results.get(b.id);
    if (!r) {
      // not run here: native blocks in pglite mode, or filtered by --only
      if (g) next[b.id] = g;
      else if (b.native && !native) err(b.line, `native block with no golden: run pnpm sql-check --engine=native --update ${unit.label}`);
      else if (!opts.only) err(b.line, `missing golden: pnpm sql-check --update ${unit.label}`);
      continue;
    }
    if (!only(b)) {
      if (g) next[b.id] = g;
      continue;
    }
    const mask = native ? MASKS.native : MASKS.timing;
    const same = matches(b, r.view, g, mask);
    if (opts.update && (!native || b.native)) {
      if (same && g) {
        next[b.id] = g;
        kept++;
      } else if (r.unstable) {
        if (g) next[b.id] = g;
      } else {
        next[b.id] = goldenBlock(b, r.view, native ? adapter.name : undefined);
        wrote++;
      }
      continue;
    }
    if (g) next[b.id] = g;
    if (!g) {
      err(b.line, `missing golden: pnpm sql-check --update ${unit.label}`);
      continue;
    }
    if (!same) {
      let diff = unifiedDiff(psqlOf(goldenStatements(g, b)), psqlOf(trimView(r.view.statements)));
      // the psql text can hide the difference (an error's position, internal query, the transaction
      // state after the block): fall back to the canonical form the comparison uses
      if (!/^[-+](?![-+]{2} )/m.test(diff)) {
        const canon = (sts, txn) => sts.map((st) => canonicalStatement(st, flagsOf(b), mask)).join("\n") + `\ntransaction after the block: ${txn ?? "I"}\n`;
        diff = unifiedDiff(canon(goldenStatements(g, b), g.txn), canon(trimView(r.view.statements), r.view.txn));
      }
      if (native && !b.native && !opts.strict) warn(b.line, `native postgres differs from the browser engine's golden\n${diff}`);
      else err(b.line, `differs from the golden${native && !b.native ? " (native)" : ""}. if the new output is right: pnpm sql-check --update ${unit.label}`, diff);
    }
  }

  if (opts.update && !opts.only) {
    const ids = new Set(wanted.map((b) => b.id));
    const pruned = Object.keys(golden?.blocks ?? {}).filter((id) => !ids.has(id)).length;
    let text;
    if (unit.kind === "mdx") {
      text = Object.keys(next).length ? stringify({ v: 1, engine: native ? golden?.engine ?? engineName : engineName, blocks: next }) + "\n" : null;
    } else {
      const examples = blocks.map((b) => ({ id: b.example.id, blockId: b.id, label: b.example.label, db: b.example.db, sql: b.example.sql, golden: next[b.id] ?? null }));
      text = stringify({ v: 1, engine: engineName, examples }) + "\n";
    }
    if (text === null) {
      if (goldenRaw !== null) {
        fs.rmSync(goldenPath);
        res.notes.push(`removed ${rel(goldenPath)} (no runnable blocks left)`);
      }
    } else if (text !== goldenRaw) {
      fs.writeFileSync(goldenPath, text);
      res.notes.push(`${rel(goldenPath)}: wrote ${wrote}, unchanged ${kept}, pruned ${pruned}`);
    } else res.notes.push(`${rel(goldenPath)}: unchanged (${kept} blocks)`);
  } else if (!opts.only) {
    const ids = new Set(wanted.map((b) => b.id));
    const orphans = Object.keys(golden?.blocks ?? {}).filter((id) => !ids.has(id));
    if (orphans.length) warn(0, `${orphans.length} golden(s) belong to blocks that no longer exist: pnpm sql-check --update ${unit.label} prunes them`);
    if (unit.kind === "examples" && golden) {
      const parsed = JSON.parse(goldenRaw);
      const stale =
        parsed.examples?.length !== blocks.length ||
        blocks.some((b, i) => {
          const x = parsed.examples[i];
          return !x || x.id !== b.example.id || x.blockId !== b.id || x.label !== b.example.label || x.db !== b.example.db || x.sql !== b.example.sql;
        });
      if (stale) err(0, `${examplesGolden} is out of date with the example files: pnpm sql-check --update ${examplesDir}`);
    }
  }
  return res;
}

/* ---- threads --------------------------------------------------------------------------------- */

async function makeAdapter(opts) {
  return opts.engine === "native" ? nativeAdapter() : pgliteAdapter();
}

/** what went wrong, readably. an mdx parse error (a VFileMessage) has an empty stack: show its reason and place */
function crashText(e) {
  if (e && typeof e === "object" && (e.reason || e.line)) {
    const at = e.line ? ` (line ${e.line}${e.column ? `:${e.column}` : ""})` : "";
    return `mdx parse failed: ${String(e.reason ?? e.message ?? "").split("\n")[0]}${at}`;
  }
  return String(e?.stack || e?.message || e);
}

if (!isMainThread) {
  const { opts } = workerData;
  const adapter = await makeAdapter(opts);
  parentPort.on("message", async (msg) => {
    if (msg === "exit") {
      await adapter.destroy?.();
      process.exit(0);
    }
    try {
      parentPort.postMessage({ ok: true, res: await checkUnit(msg, opts, adapter), engine: adapter.name });
    } catch (e) {
      parentPort.postMessage({ ok: false, label: msg.label, message: crashText(e) });
    }
  });
  parentPort.postMessage({ ready: true });
} else {
  await main();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts) {
    console.error(USAGE);
    process.exit(2);
  }
  const pin = sitePin();
  const installed = pgliteVersion();
  if (pin.pglite !== installed) {
    console.error(`sql-check: src/lib/site.ts pins pglite ${pin.pglite}, node_modules has ${installed}`);
    process.exit(3);
  }

  // what to check
  const inputs = opts.paths.length ? opts.paths : ["content", examplesDir];
  const onlyFile = opts.only?.includes(":") ? path.resolve(root, opts.only.split(":")[0]) : null;
  const mdx = new Set();
  const exampleFiles = new Set();
  const exDir = path.join(root, examplesDir);
  const walk = (p) => {
    if (!fs.existsSync(p)) {
      console.error(`sql-check: ${p} doesn't exist`);
      process.exit(2);
    }
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) if (f !== "node_modules" && !f.startsWith(".")) walk(path.join(p, f));
    } else if (p.endsWith(".mdx")) mdx.add(path.resolve(p));
    else if (p.endsWith(".sql") && path.resolve(path.dirname(p)) === exDir) exampleFiles.add(path.resolve(p));
  };
  for (const p of inputs) walk(path.resolve(root, p));
  /** @type {any[]} */
  let units = [...mdx].sort().map((file) => ({ kind: "mdx", file, label: rel(file) }));
  if (exampleFiles.size) {
    // the examples golden covers every example, so always take the whole folder
    const files = fs.readdirSync(exDir).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(exDir, f));
    units.push({ kind: "examples", files, label: examplesDir });
  }
  if (onlyFile) units = units.filter((u) => u.file === onlyFile);
  if (!units.length) {
    if (!opts.json) console.log("sql-check: nothing to check");
    process.exit(0);
  }

  const t0 = performance.now();
  const cpus = os.availableParallelism?.() ?? os.cpus().length;
  const jobs = Math.max(1, Math.min(opts.jobs ?? Math.min(4, Math.floor(cpus / 2)), units.length, opts.engine === "native" ? 1 : 64));
  const results = [];
  let engineName = null;
  const fail = (label, message) => results.push({ file: label, blocks: 0, errors: [{ line: 0, msg: `crashed: ${message}` }], warnings: [], notes: [] });

  // the native engine runs in-process (one shared cluster). PGlite always runs in workers, even for one
  // job, so a file that hangs can be killed by the deadline below instead of freezing the whole run.
  if (opts.engine === "native") {
    let adapter;
    try {
      adapter = await makeAdapter(opts);
    } catch (e) {
      console.error(`sql-check: ${e.message}`);
      process.exit(3);
    }
    for (const u of units) {
      try {
        results.push(await checkUnit(u, opts, adapter));
      } catch (e) {
        fail(u.label, crashText(e));
      }
      engineName ??= adapter.name;
    }
    await adapter.destroy?.();
  } else {
    const queue = [...units];
    // a file that never finishes (a PGlite call that doesn't settle) would leave its worker silent and the
    // whole run waiting at 0% cpu. so each file gets a deadline: past it, the worker is killed, the file is
    // reported as timed out, and a fresh worker takes the rest of the queue.
    const DEADLINE_MS = 180_000;
    const runSlot = () =>
      new Promise((resolve) => {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { opts } });
        let current = null;
        let timer = null;
        let replaced = false;
        const next = () => {
          clearTimeout(timer);
          current = queue.shift() ?? null;
          if (!current) return w.postMessage("exit");
          w.postMessage(current);
          timer = setTimeout(() => {
            fail(current.label, `timed out after ${DEADLINE_MS / 1000} s`);
            replaced = true;
            w.terminate();
            runSlot().then(resolve);
          }, DEADLINE_MS);
        };
        w.on("message", (m) => {
          if (m.ready) return next();
          if (m.ok) {
            results.push(m.res);
            engineName ??= m.engine;
          } else fail(m.label, m.message);
          next();
        });
        w.on("error", (e) => {
          clearTimeout(timer);
          fail(current?.label ?? "worker", crashText(e));
          if (!replaced) resolve();
        });
        w.on("exit", () => {
          clearTimeout(timer);
          if (!replaced) resolve();
        });
      });
    await Promise.all(Array.from({ length: jobs }, runSlot));
  }

  if (opts.engine === "pglite" && engineName && engineName !== pin.engine) {
    console.error(`sql-check: the engine says "${engineName}", src/lib/site.ts pins "${pin.engine}"`);
    process.exit(3);
  }

  results.sort((a, b) => a.file.localeCompare(b.file));
  const errors = results.reduce((n, r) => n + r.errors.length, 0);
  const warnings = results.reduce((n, r) => n + r.warnings.length, 0);
  const blocks = results.reduce((n, r) => n + r.blocks, 0);
  const secs = ((performance.now() - t0) / 1000).toFixed(1);

  if (opts.json) {
    console.log(JSON.stringify({ engine: engineName, blocks, errors, warnings, seconds: Number(secs), files: results }, null, 2));
  } else {
    const color = process.stdout.isTTY;
    for (const r of results) {
      const bad = r.errors.length || (opts.strict && r.warnings.length);
      if (!bad && !r.warnings.length && !r.notes.length) {
        if (r.blocks) console.log(`✓ ${r.file} (${r.blocks} block${r.blocks === 1 ? "" : "s"})`);
        continue;
      }
      console.log(`${bad ? "✗" : r.warnings.length ? "!" : "✓"} ${r.file}${r.blocks ? ` (${r.blocks} block${r.blocks === 1 ? "" : "s"})` : ""}`);
      for (const e of r.errors) {
        console.log(`  ✗ ${r.file}${e.line ? `:${e.line}` : ""} ${e.msg}`);
        if (e.diff) console.log(e.diff.split("\n").map((l) => "      " + (color ? l : l)).join("\n"));
      }
      for (const w of r.warnings) console.log(`  ! ${r.file}${w.line ? `:${w.line}` : ""} ${w.msg.split("\n").join("\n      ")}`);
      for (const n of r.notes) console.log(`  · ${n}`);
    }
    console.log(`\n${blocks} block(s) on ${engineName ?? opts.engine}, ${errors} error(s), ${warnings} warning(s), ${secs} s`);
  }
  process.exit(errors || (opts.strict && warnings) ? 1 : 0);
}
