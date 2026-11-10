// run one parsed scenario against a throwaway server and build the PgTrace (src/lib/db/pgtrace.ts).

import fs from "node:fs";
import path from "node:path";
import { RAW_TYPES, TRACE_SETTINGS, findPg, lsnToNumber, startCluster } from "../../../scripts/lib/native-pg.mjs";
import { instrument, loadBuiltinTypes, runStatement, txnStatus, txnStatusSettled } from "../../../scripts/lib/collect-pg.mjs";
import { INSPECT_EXT, bundleUrl, wrapPglite } from "./pglite.mjs";
import {
  Catalog,
  lit,
  lsnStr,
  normalizeText,
  parseWaldump,
  probeBtree,
  probeBuffers,
  probeFsm,
  probeHash,
  probeHeap,
  probeLocks,
  probeLog,
  probeRows,
  probeStats,
  probeVm,
  probeXact,
  probeXids,
  readWal,
  walPointers,
} from "./probes.mjs";
import { splitSql } from "./split.mjs";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

/** how long a step may sit blocked before we call it blocked and move on */
const BLOCK_WINDOW_MS = 500;
/** how long a step may run without being blocked */
const STEP_TIMEOUT_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** settings that are about logging, not about what the scenario shows */
const QUIET = new Set(["log_line_prefix", "log_min_messages", "log_error_verbosity", "log_checkpoints"]);

/** statements that run without taking a snapshot (so they can't fix a repeatable read snapshot) */
const NO_SNAPSHOT = /^\s*(BEGIN|START\s+TRANSACTION|SET|RESET|SHOW|LOCK|SAVEPOINT|RELEASE|ROLLBACK|COMMIT|END|ABORT|CHECKPOINT|LISTEN|NOTIFY|UNLISTEN|PREPARE\s+TRANSACTION)\b/i;

class ScenarioError extends Error {}

// ------------------------------------------------------------------------------------- engines

async function openNative(sc, { keep }) {
  const pg = findPg();
  const settings = { ...TRACE_SETTINGS, ...sc.server };
  const cluster = await startCluster({ pg, settings, checksums: sc.checksums, keep });
  const eng = { kind: "native", cluster, pg, settings, hasActivity: true };

  const rawQuery = (client) => async (sql) => (await client.query({ text: sql, rowMode: "array", types: RAW_TYPES })).rows;

  eng.connectObserver = async () => {
    const c = await cluster.connect({ application_name: "pgtrace" });
    // the observer reads pages, catalogs and views all the time. keep it out of the statistics.
    await c.query("SET track_counts = off");
    instrument(c);
    await loadBuiltinTypes(c);
    eng.probeClient = c;
    eng.q = rawQuery(c);
    eng.run = (sql) => runStatement(c, sql);
  };

  /** a scenario session (or the obs session): its own backend */
  eng.connectSession = async (name, sessionSettings = {}) => {
    const c = await cluster.connect({ application_name: name });
    instrument(c);
    await loadBuiltinTypes(c); // before any step: never read the catalog mid-transaction
    for (const [k, v] of Object.entries(sessionSettings)) await c.query(`SET ${k} = ${lit(v)}`);
    const s = makeSession(name, c);
    s.defaultIso = (await s.query("SHOW default_transaction_isolation"))[0][0];
    s.iso = s.defaultIso;
    return s;
  };

  function makeSession(name, client) {
    const s = {
      name,
      client,
      pid: client.processID,
      iso: "read committed",
      snapTaken: false,
      lastSnap: null,
      pending: null,
      dead: false,
      settings: {},
      txn: () => (s.dead ? "I" : txnStatus(client)),
      settle: () => txnStatusSettled(client).catch(() => {}),
      query: rawQuery(client),
      /** run each statement of `sql` in order; resolves to the last StatementResult (or the first error) */
      async send(sql) {
        let last = null;
        for (const st of splitSql(sql)) {
          last = await runStatement(client, st.sql);
          if (last.error) break;
        }
        // after an error, wait for the ReadyForQuery that says "E" (collect-pg.mjs)
        if (last?.error && !s.dead) await txnStatusSettled(client).catch(() => {});
        return last;
      },
    };
    return s;
  }

  eng.setup = async (statements, onError) => {
    // setup runs in its own connection (with statistics on, like any real load), closed after
    const c = await cluster.connect({ application_name: "pgtrace setup" });
    instrument(c);
    await loadBuiltinTypes(c);
    try {
      for (const st of statements) {
        const r = await runStatement(c, st.sql);
        if (r.error) onError(st, r.error);
      }
    } finally {
      await c.end();
    }
  };

  eng.crash = async () => {
    await cluster.crash();
  };
  eng.restart = async () => {
    await cluster.start();
  };
  eng.controldata = () => cluster.controldata();
  eng.waldump = (args) => cluster.waldump(args);
  eng.logSize = () => cluster.logSize();
  eng.logSince = (off) => cluster.logSince(off);
  eng.close = () => cluster.destroy();
  await eng.connectObserver();
  return eng;
}

async function openLite(sc) {
  // the browser's path, exactly (public/sql/engine.js, the same calls sql-check makes): seed the
  // dataset in one PGlite, dump its data directory, then open a fresh PGlite from that snapshot
  // and run the scenario there. so the pool starts cold, pages come back from "disk" with their
  // checksums, and the first new object gets the oid a browser block would see (24576).
  // the inspection extensions go into the seed's one transaction after the dataset (lab already
  // has them), which keeps xids and the dataset's oids where the browser's copy has them.
  const { loadNodeEngine, readDataset } = await import("../../../scripts/lib/datasets.mjs");
  const browser = await import("../../../public/sql/engine.js");
  const e = await loadNodeEngine();
  const ext = { ...e.extensions };
  for (const name of [...INSPECT_EXT, ...sc.ext]) if (!ext[name]) ext[name] = bundleUrl(name) ?? undefined;
  const ds = readDataset(sc.db ?? "empty");
  // the dataset's own extensions first, then its tables, then the extra inspection extensions,
  // all in the seed's one transaction: the dataset's objects get the oids the browser's copy has
  // (shop.customers = 16385, as in a run block). tools/pgtrace/test pins it.
  const extra = [...new Set([...INSPECT_EXT, ...sc.ext.filter((x) => ext[x])])].filter((x) => !ds.extensions.includes(x));
  const seed = { ...ds, statements: [...ds.statements, ...extra.map((x) => `CREATE EXTENSION IF NOT EXISTS ${x};`)] };
  const seeded = await browser.seedDataset(e.PGlite, e.protocol, seed, { extensions: ext, modules: e.modules });
  const db = await browser.openDb(e.PGlite, { snapshot: seeded.snapshot, extensions: ext, modules: e.modules });
  const p = await wrapPglite(db, e.protocol);
  const eng = { kind: "pglite", lite: p, settings: { ...sc.server }, hasActivity: false, q: p.q, run: p.run };
  const session = (name) => ({
    name,
    pid: null,
    iso: "read committed",
    snapTaken: false,
    lastSnap: null,
    pending: null,
    dead: false,
    txn: () => p.txn(),
    query: p.q,
    async send(sql) {
      let last = null;
      for (const st of splitSql(sql)) {
        last = await p.run(st.sql);
        if (last.error) break;
      }
      return last;
    },
  });
  eng.connectObserver = async () => {};
  eng.connectSession = async (name) => {
    const s = session(name);
    s.defaultIso = (await p.q("SHOW default_transaction_isolation"))[0][0];
    s.iso = s.defaultIso;
    return s;
  };
  eng.setup = async (statements, onError) => {
    for (const st of statements) {
      const r = await p.run(st.sql);
      if (r.error) onError(st, r.error);
    }
  };
  eng.logSize = () => 0;
  eng.logSince = () => [];
  eng.close = () => p.close();
  // PGlite is one backend: server settings become session settings
  for (const [k, v] of Object.entries(sc.server)) await p.q(`SET ${k} = ${lit(v)}`);
  return eng;
}

// ------------------------------------------------------------------------------------- datasets

/**
 * load datasets/<name> exactly the way the site seeds it (public/sql/engine.js seedDataset):
 * its extensions and statements in one transaction, VACUUM (ANALYZE) when the dataset asks,
 * CHECKPOINT. same statements, same order, so xids and LSNs match the browser's copy.
 */
async function loadDataset(eng, name, fail) {
  if (!fs.existsSync(path.join(ROOT, "datasets", name, "dataset.json"))) fail(`@db ${name}: datasets/${name}/dataset.json doesn't exist`);
  const { readDataset } = await import("../../../scripts/lib/datasets.mjs");
  const ds = readDataset(name);
  const body = [...ds.extensions.map((e) => `CREATE EXTENSION ${e}`), ...ds.statements];
  const stmts = body.length ? ["BEGIN", ...body, "COMMIT"] : [];
  if (ds.analyze) stmts.push("VACUUM (ANALYZE)");
  stmts.push("CHECKPOINT");
  await eng.setup(
    stmts.map((sql) => ({ sql })),
    (st, e) => fail(`@db ${name}: ${e.sqlstate} ${e.message}\n  in: ${st.sql.slice(0, 160)}`),
  );
}

// ------------------------------------------------------------------------------------- stages

const CLAUSES = ["FROM", "WHERE", "GROUP BY", "HAVING", "WINDOW", "ORDER BY", "LIMIT", "OFFSET", "FETCH"];

/** cut a plain SELECT at its top-level clause keywords */
function clauses(sql) {
  const out = [];
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < sql.length && !(sql[i] === q && sql[i + 1] !== q)) i += sql[i] === q ? 2 : 1;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && /\s/.test(sql[i - 1] ?? " ")) {
      for (const k of CLAUSES) {
        const re = new RegExp(`^${k.replace(" ", "\\s+")}\\b`, "i");
        const m = re.exec(sql.slice(i));
        if (m) {
          out.push({ k, at: i, body: i + m[0].length });
          i += m[0].length - 1;
          break;
        }
      }
    }
  }
  return out;
}

/** derive prefix queries for a simple SELECT: FROM, WHERE, SELECT, ORDER BY, LIMIT */
export function deriveStages(sql) {
  const s = sql.trim().replace(/;$/, "");
  const sel = /^SELECT\s+/i.exec(s);
  if (!sel || /^SELECT\s+DISTINCT\b/i.test(s)) throw new ScenarioError("@stages can only derive stages for a plain SELECT; write them with -- @stage");
  const cs = clauses(s);
  const part = (k) => {
    const i = cs.findIndex((c) => c.k === k);
    if (i < 0) return null;
    return s.slice(cs[i].body, cs[i + 1]?.at ?? s.length).trim();
  };
  for (const k of ["GROUP BY", "HAVING", "WINDOW"]) if (part(k) != null) throw new ScenarioError(`@stages can't derive a ${k} stage; write the stages with -- @stage`);
  const from = part("FROM");
  if (!from) throw new ScenarioError("@stages: no FROM");
  const list = s.slice(sel[0].length, cs.find((c) => c.k === "FROM").at).trim();
  const where = part("WHERE");
  const order = part("ORDER BY");
  const out = [{ clause: "FROM", sql: `SELECT * FROM ${from}` }];
  if (where) out.push({ clause: "WHERE", sql: `SELECT * FROM ${from} WHERE ${where}` });
  out.push({ clause: "SELECT", sql: `SELECT ${list} FROM ${from}${where ? ` WHERE ${where}` : ""}` });
  if (order) out.push({ clause: "ORDER BY", sql: `SELECT ${list} FROM ${from}${where ? ` WHERE ${where}` : ""} ORDER BY ${order}` });
  if (["LIMIT", "OFFSET", "FETCH"].some((k) => part(k) != null)) out.push({ clause: "LIMIT", sql: s });
  return out;
}

// ------------------------------------------------------------------------------------- the run

const CONTROL_KEYS = [
  "Database cluster state",
  "Latest checkpoint location",
  "Latest checkpoint's REDO location",
  "Latest checkpoint's REDO WAL file",
  "Latest checkpoint's TimeLineID",
  "Latest checkpoint's full_page_writes",
  "Latest checkpoint's NextXID",
  "Latest checkpoint's NextOID",
  "Latest checkpoint's oldestXID",
  "Minimum recovery ending location",
  "wal_level setting",
  "Database block size",
  "Bytes per WAL segment",
  "Data page checksum version",
];

/**
 * @param {ReturnType<import("./scenario.mjs").parseScenario>} sc
 * @param {{ engine?: "native" | "pglite", keep?: boolean, log?: (s: string) => void }} opts
 */
export async function runScenario(sc, { engine: forced, keep = false, log = () => {} } = {}) {
  const kind = forced ?? sc.engine ?? "native";
  const where = (st) => `${sc.file}:${st.line}`;
  const fail = (msg) => {
    throw new ScenarioError(msg);
  };
  const warnings = [];
  const warn = (m) => {
    if (!warnings.includes(m)) warnings.push(m);
  };

  if (kind === "pglite") {
    if (sc.sessions.length > 1) fail(`${sc.file}: --engine=pglite runs one session; this scenario has ${sc.sessions.join(", ")}`);
    for (const st of sc.steps) {
      if (st.blocks) fail(`${where(st)}: blocking needs two sessions, so --engine=native`);
      if (st.kind === "crash" || st.kind === "restart") fail(`${where(st)}: @${st.kind} needs --engine=native`);
    }
  }

  const eng = kind === "native" ? await openNative(sc, { keep }) : await openLite(sc);
  try {
    // always the current observer connection (it is replaced after a restart)
    const q = (sql) => eng.q(sql);
    const [[version, block, walBlock, seg, checksums, io]] = await q(
      `SELECT current_setting('server_version'), current_setting('block_size'), current_setting('wal_block_size'),
              pg_size_bytes(current_setting('wal_segment_size'))::text, current_setting('data_checksums'), current_setting('io_method')`,
    );
    const major = Number(version.split(".")[0]);
    const shortVersion = /^\d+(\.\d+)?/.exec(version)[0];
    const want = Number(/major:\s*(\d+)/.exec(fs.readFileSync(path.join(ROOT, "src/lib/site.ts"), "utf8"))[1]);
    if (major !== want) fail(`server is postgres ${version}, the site is written against ${want}`);

    // the dataset, then the inspection extensions, then the scenario's own setup
    // (PGlite: the dataset is already in the snapshot it was opened from)
    if (sc.db && kind !== "pglite") await loadDataset(eng, sc.db, fail);
    const exts = [...new Set([...INSPECT_EXT, ...sc.ext])];
    await eng.setup(
      exts.map((e) => ({ sql: `CREATE EXTENSION IF NOT EXISTS ${e}` })),
      (st, e) => fail(`${sc.file}: ${st.sql}: ${e.message}`),
    );
    await eng.setup(sc.setupStatements, (st, e) => {
      const line = sc.setup.slice(0, st.offset).split("\n").length;
      fail(`${sc.file}: @setup statement ${line}: ${e.sqlstate} ${e.message}\n  in: ${st.sql.slice(0, 200)}`);
    });

    // vacuum the system catalogs: CREATE EXTENSION and DDL leave dead catalog tuples, and the
    // first probe that looks up a function would prune them, writing WAL the scenario didn't cause
    const [[cats]] = await q(
      `SELECT string_agg(c.oid::regclass::text, ', ' ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace = 'pg_catalog'::regnamespace AND c.relkind = 'r'`,
    );
    await eng.setup([{ sql: `VACUUM ${cats}` }], (st, e) => fail(`${sc.file}: catalog vacuum: ${e.message}`));

    // sessions (declared order), then the obs session if any step uses it
    const sessions = [];
    for (const name of sc.sessions) sessions.push(await eng.connectSession(name, sc.sessionSettings[name]));
    let obs = null;
    if (sc.steps.some((s) => s.session === "obs" && s.kind !== "probe")) obs = await eng.connectSession("obs");
    const byName = new Map(sessions.map((s) => [s.name, s]));
    if (obs) byName.set("obs", obs);
    const pidName = new Map();
    const refreshPids = () => {
      pidName.clear();
      for (const s of [...sessions, ...(obs ? [obs] : [])]) if (s.pid != null) pidName.set(s.pid, s.name);
    };
    refreshPids();

    const cat = new Catalog(q);
    await cat.refresh();
    let logOffset = eng.logSize();
    const ctx = {
      q,
      run: (sql) => eng.run(sql),
      cat,
      sessions,
      pidName,
      blockSize: Number(block),
      hasActivity: eng.hasActivity,
      warn,
      paths: eng.cluster ? [eng.cluster.root] : [],
      logSince: () => {
        const lines = eng.logSince(logOffset);
        logOffset = eng.logSize();
        return lines;
      },
    };

    const [[nextXid]] = await q("SELECT pg_snapshot_xmax(pg_current_snapshot())::text");
    const basePtr = await walPointers(ctx);
    const base = { xid: Number(nextXid), lsn: basePtr.insert };

    const trace = {
      v: 1,
      scenario: sc.file,
      title: sc.title,
      engine: {
        version: shortVersion,
        major,
        blockSize: Number(block),
        walBlockSize: Number(walBlock),
        segSize: Number(seg),
        checksums: checksums === "on",
        ioMethod: io,
        ...(kind === "pglite" ? { build: `PGlite ${eng.lite.pglite}` } : {}),
      },
      server: Object.fromEntries(Object.entries(eng.settings).filter(([k]) => !QUIET.has(k))),
      sessions: sc.sessions,
      rels: {},
      base,
      setup: sc.setup,
      steps: [],
    };
    if (sc.db) trace.db = sc.db;

    // WAL bookkeeping: records are read in bulk (pg_walinspect only reads up to the flush
    // pointer), then handed to steps by LSN: a step with the wal probe gets the records inserted
    // since the previous step with the wal probe. epochs separate before and after a crash.
    const wal = { cursor: base.lsn, records: [], epoch: 0, start: [base.lsn], marks: [] };
    const readUpTo = async (to) => {
      const recs = await readWal(ctx, wal.cursor, to);
      for (const r of recs) wal.records.push({ ...r, _epoch: wal.epoch });
      if (recs.length) wal.cursor = recs[recs.length - 1].end;
    };

    // command is the bare command ("UPDATE", "CREATE TABLE"), rows the count from the tag:
    // adapters rebuild psql's "UPDATE 1" / "INSERT 0 1" from the two
    const toResult = (r) => ({
      command: r.command,
      rows: r.rowCount,
      columns: (r.columns ?? []).map((c) => ({ name: c.name, type: c.type })),
      data: r.rows,
    });
    const toError = (e) => {
      const out = { sqlstate: e.sqlstate, message: normalizeText(e.message, pidName) };
      if (e.detail) out.detail = normalizeText(e.detail, pidName);
      return out;
    };
    const noteSnapshot = (s, sql) => {
      if (splitSql(sql).some((x) => !NO_SNAPSHOT.test(x.sql))) s.snapTaken = true;
    };
    const settle = (s) => {
      if (s.txn() === "I") {
        s.snapTaken = false;
        s.lastSnap = null;
        s.iso = s.defaultIso;
      }
    };
    const checkErrors = (st, err, k) => {
      if (err && !st.errors) fail(`${where(st)}: step ${k} failed with ${err.sqlstate} ${err.message}. if that's the point, mark it errors=${err.sqlstate}`);
      if (!err && st.errors) fail(`${where(st)}: step ${k} was expected to fail (errors=${st.errors}) but succeeded`);
      if (err && st.errors !== "*" && st.errors !== err.sqlstate) fail(`${where(st)}: step ${k} failed with ${err.sqlstate}, expected ${st.errors}: ${err.message}`);
    };

    const isBlocked = async (s) => {
      if (!eng.hasActivity) return false;
      const others = [...pidName.keys()].filter((p) => p !== s.pid);
      if (!others.length) return false;
      const [[b]] = await q(`SELECT pg_isolation_test_session_is_blocked(${s.pid}, '{${others.join(",")}}'::int[])`);
      return b === "t";
    };

    /** send and wait: settles, or is blocked for the whole window */
    const sendStep = async (s, sql, st) => {
      noteSnapshot(s, sql);
      const p = s.send(sql).then(
        (r) => ({ r }),
        (e) => ({ e }),
      );
      s.pending = p;
      const t0 = Date.now();
      let blockedSince = null;
      for (;;) {
        const done = await Promise.race([p, sleep(5).then(() => null)]);
        if (done) {
          s.pending = null;
          if (done.e) fail(`${where(st)}: ${s.name} lost its connection: ${done.e.message}`);
          return { result: done.r };
        }
        const b = await isBlocked(s);
        if (b && blockedSince == null) blockedSince = Date.now();
        if (!b) blockedSince = null;
        if (blockedSince != null && Date.now() - t0 >= BLOCK_WINDOW_MS) return { blocked: true };
        if (blockedSince == null && Date.now() - t0 > STEP_TIMEOUT_MS) fail(`${where(st)}: step ran for ${STEP_TIMEOUT_MS / 1000}s without finishing`);
      }
    };

    /** sessions blocked by earlier steps: wait until each has finished or is still (stably) blocked */
    const drain = async () => {
      const woke = [];
      for (const s of sessions.concat(obs ? [obs] : [])) {
        if (!s.pending) continue;
        const t0 = Date.now();
        let stable = 0;
        for (;;) {
          const done = await Promise.race([s.pending, sleep(5).then(() => null)]);
          if (done) {
            const ps = s.pendingStep;
            s.pending = null;
            s.pendingStep = null;
            const r = done.r;
            const w = { session: s.name, step: ps.k };
            if (done.e || !r) w.error = { sqlstate: "08006", message: "server closed the connection unexpectedly" };
            else if (r.error) w.error = toError(r.error);
            else w.result = toResult(r);
            if (!done.e) checkErrors(ps.st, r?.error, ps.k);
            settle(s);
            woke.push(w);
            break;
          }
          if (await isBlocked(s)) {
            if (++stable >= 4) break;
          } else stable = 0;
          if (Date.now() - t0 > STEP_TIMEOUT_MS) fail(`${s.name} neither finished nor blocked within ${STEP_TIMEOUT_MS / 1000}s`);
        }
      }
      return woke;
    };

    const blockedInfo = async (s) => {
      const [[pids]] = await q(`SELECT pg_blocking_pids(${s.pid})::text`);
      const by = (pids.replace(/[{}]/g, "") ? pids.replace(/[{}]/g, "").split(",") : []).map((p) => pidName.get(Number(p)) ?? `pid ${p}`);
      const lock = (await probeLocks(ctx, s.pid)).find((l) => !l.granted) ?? null;
      return { by, lock };
    };

    /** probes, in the fixed order */
    const runProbes = async (step, probes) => {
      const has = (n) => probes.filter((p) => p.name === n);
      if (probes.some((p) => ["heap", "btree", "hash", "vm", "fsm", "rows", "stats", "buffers"].includes(p.name))) await cat.refresh();
      if (has("xids").length) step.xids = await probeXids(ctx);
      if (has("locks").length) step.locks = await probeLocks(ctx);
      if (has("buffers").length) step.buffers = await probeBuffers(ctx);
      if (has("wal").length) {
        step.wal = { ...(await walPointers(ctx)), records: [] };
        wal.marks.push({ step, epoch: wal.epoch, to: step.wal.insert });
      }
      for (const p of has("heap")) (step.heap ??= {})[p.args[0]] = await probeHeap(ctx, p.args);
      for (const p of has("btree")) (step.btree ??= {})[p.args[0]] = await probeBtree(ctx, p.args);
      for (const p of has("hash")) (step.hash ??= {})[p.args[0]] = await probeHash(ctx, p.args);
      for (const p of has("vm")) (step.vm ??= {})[p.args[0]] = await probeVm(ctx, p.args);
      for (const p of has("fsm")) (step.fsm ??= {})[p.args[0]] = await probeFsm(ctx, p.args);
      for (const p of has("rows")) (step.rows ??= {})[p.args[0]] = await probeRows(ctx, p.args);
      if (has("stats").length) step.stats = await probeStats(ctx, has("stats").flatMap((p) => p.args));
      if (has("log").length) {
        if (kind === "pglite") warn("the log probe needs --engine=native");
        else step.log = probeLog(ctx);
      }
      // commit status of every xid on show
      if (step.xids || step.heap) {
        const xs = [];
        for (const e of Object.values(step.xids ?? {})) {
          if (e.xid) xs.push(e.xid);
          if (e.snap) xs.push(...e.snap.xip);
        }
        for (const pages of Object.values(step.heap ?? {}))
          for (const pg of pages)
            for (const t of pg.tuples) {
              if (t.xmin) xs.push(t.xmin);
              if (t.xmax && !(t.flags ?? []).includes("HEAP_XMAX_IS_MULTI")) xs.push(t.xmax);
            }
        const xact = await probeXact(ctx, xs);
        if (Object.keys(xact).length) step.xact = xact;
      }
    };

    for (const [k, st] of sc.steps.entries()) {
      log(`  ${k} ${st.kind === "sql" ? "" : `@${st.kind} `}${st.session ?? ""} ${(st.sql || st.note || "").split("\n")[0].slice(0, 70)}`);
      const step = { i: k, session: st.session, sql: st.sql || "", ...(st.note ? { note: st.note } : {}), status: "ok" };
      let probesDone = false;

      if (st.kind === "sql" || st.kind === "explain" || st.kind === "stages") {
        const s = byName.get(st.session);
        if (!s) fail(`${where(st)}: no session ${st.session}`);
        if (s.dead) fail(`${where(st)}: ${s.name} has no connection (crashed, and no @restart yet)`);
        if (s.pending) fail(`${where(st)}: ${s.name} is still blocked by an earlier step, it can't run anything else`);

        if (st.kind === "sql") {
          const out = s === obs || !eng.hasActivity ? { result: await (noteSnapshot(s, st.sql), s.send(st.sql)) } : await sendStep(s, st.sql, st);
          if (out.blocked) {
            if (!st.blocks) fail(`${where(st)}: step ${k} (${s.name}) blocked. if that's the point, mark it: -- @step ${s.name} blocks`);
            step.status = "blocked";
            step.blocked = await blockedInfo(s);
            s.pendingStep = { k, st, step };
          } else {
            if (st.blocks) fail(`${where(st)}: step ${k} is marked blocks but finished without waiting`);
            const r = out.result;
            checkErrors(st, r.error, k);
            if (r.error) {
              step.status = "error";
              step.error = toError(r.error);
            } else step.result = toResult(r);
            settle(s);
          }
        } else if (st.kind === "explain") {
          const dml = st.analyze && /\b(INSERT|UPDATE|DELETE|MERGE)\b/i.test(st.sql);
          const inTxn = s.txn() !== "I";
          const opts = st.analyze ? "ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF, FORMAT JSON" : "FORMAT JSON";
          noteSnapshot(s, st.sql);
          if (dml) await s.send(inTxn ? "SAVEPOINT pgtrace_explain" : "BEGIN");
          const r = await s.send(`EXPLAIN (${opts}) ${st.sql}`);
          if (dml) await s.send(inTxn ? "ROLLBACK TO SAVEPOINT pgtrace_explain; RELEASE SAVEPOINT pgtrace_explain" : "ROLLBACK");
          checkErrors(st, r.error, k);
          if (r.error) {
            step.status = "error";
            step.error = toError(r.error);
          } else step.explain = JSON.parse(r.rows[0][0])[0];
          settle(s);
        } else {
          const stages = st.stages.length ? st.stages : deriveStages(st.sql);
          step.stages = [];
          noteSnapshot(s, st.sql);
          for (const sg of stages) {
            const r = await s.send(sg.sql);
            if (r.error) fail(`${where(st)}: stage ${sg.clause} failed: ${r.error.message}\n  in: ${sg.sql}`);
            step.stages.push({ clause: sg.clause, ...(sg.note ? { note: sg.note } : {}), ...(sg.group ? { group: sg.group } : {}), sql: sg.sql, columns: r.columns.map((c) => c.name), types: r.columns.map((c) => c.type), data: r.rows });
          }
          const r = await s.send(st.sql);
          if (r.error) fail(`${where(st)}: ${r.error.message}`);
          step.result = toResult(r);
          settle(s);
        }
      } else if (st.kind === "crash") {
        step.sql = "pg_ctl stop -m immediate";
        await runProbes(step, st.probes);
        probesDone = true;
        await readUpTo(step.wal.flush);
        const crashLog = eng.logSize();
        // name every relation now: after the crash nobody's left to ask what a relfilenode is
        await cat.cacheNodes();
        await eng.crash();
        cat.offline = true;
        for (const s of [...sessions, ...(obs ? [obs] : [])]) s.dead = true;
        // what made it to disk: written WAL survives a process crash even if it wasn't flushed
        const survivors = await parseWaldump(ctx, await eng.waldump(["-s", lsnStr(wal.cursor)]));
        for (const r of survivors) if (r.lsn >= wal.cursor) wal.records.push({ ...r, _epoch: wal.epoch });
        if (survivors.length) wal.cursor = survivors[survivors.length - 1].end;
        const ctl = await eng.controldata();
        step.control = Object.fromEntries(CONTROL_KEYS.filter((k2) => k2 in ctl).map((k2) => [k2, ctl[k2]]));
        const redo = lsnToNumber(ctl["Latest checkpoint's REDO location"]);
        // what recovery will replay: everything on disk from the redo pointer
        step.wal.records = await parseWaldump(ctx, await eng.waldump(["-s", lsnStr(redo)]));
        step.wal.onDisk = true;
        // sessions that were waiting die with the server
        const woke = [];
        for (const s of [...sessions, ...(obs ? [obs] : [])]) {
          if (!s.pending) continue;
          woke.push({ session: s.name, step: s.pendingStep.k, error: { sqlstate: "57P01", message: "server closed the connection unexpectedly" } });
          s.pending = null;
          s.pendingStep = null;
        }
        if (woke.length) step.woke = woke;
        logOffset = crashLog;
      } else if (st.kind === "restart") {
        step.sql = "pg_ctl start";
        await eng.restart();
        await eng.connectObserver();
        cat.offline = false;
        for (let j = 0; j < sessions.length; j++) {
          sessions[j] = await eng.connectSession(sessions[j].name, sc.sessionSettings[sessions[j].name]);
          byName.set(sessions[j].name, sessions[j]);
        }
        if (obs) {
          obs = await eng.connectSession("obs");
          byName.set("obs", obs);
        }
        ctx.sessions = sessions;
        refreshPids();
        wal.epoch++;
        wal.start[wal.epoch] = wal.cursor;
      } else if (st.kind === "probe") {
        step.sql = "";
      }

      const woke = await drain();
      if (woke.length) step.woke = [...(step.woke ?? []), ...woke];
      if (!probesDone) await runProbes(step, st.probes);
      trace.steps.push(step);
    }

    // flush whatever is still only in wal_buffers (a non-transactional message, after every
    // step's records), then read the rest of the WAL and hand records to steps
    if (wal.marks.length) {
      const [[endLsn]] = await q(`SELECT pg_logical_emit_message(false, 'pgtrace', 'end', true)::text`);
      await readUpTo(lsnToNumber(endLsn));
      const from = new Map();
      for (const m of wal.marks) {
        const start = from.get(m.epoch) ?? wal.start[m.epoch];
        if (!m.step.wal.onDisk)
          m.step.wal.records = wal.records.filter((r) => r._epoch === m.epoch && r.lsn >= start && r.lsn < m.to).map(({ _epoch, ...r }) => r);
        from.set(m.epoch, Math.max(start, m.to));
      }
      // volatile: snapshots the bgwriter logs on its own, checkpoints nobody asked for
      for (const m of wal.marks) {
        const asked = /\bCHECKPOINT\b/i.test(m.step.sql) || m.step.sql === "pg_ctl start" || m.step.sql === "pg_ctl stop -m immediate";
        for (const r of m.step.wal.records) {
          if (r.rmgr === "Standby" && r.type === "RUNNING_XACTS" && !asked) r.volatile = true;
          if (r.rmgr === "XLOG" && /^CHECKPOINT/.test(r.type) && !asked) r.volatile = true;
        }
        delete m.step.wal.onDisk;
      }
    }

    await cat.refresh();
    trace.rels = await cat.describe();
    return { trace, warnings };
  } finally {
    await eng.close();
  }
}

export { ScenarioError };
