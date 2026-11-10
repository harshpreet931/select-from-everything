// select * from everything: the sql worker. a plain module worker, not bundled: PGlite finds its
// files relative to its own url and has node-only branches a bundler would trip over.
// one worker runs everything, one message at a time. the page (src/lib/sql/index.ts) kills it
// when a run takes too long (statement_timeout can't fire: the wasm blocks the event loop),
// then starts a new one and hands it the compiled modules and snapshots it kept.
//
// → { t: "init", id, base, ext: string[], spare: boolean, cache? }
// → { t: "dataset", id, name, url, hash, fingerprint, snapshot?, types?, setups?, engine? }
// → { t: "run", id, db, fresh, key?, ext, setup: string[], prelude: { stmts, errors }[], stmts, errors, maxRows, maxBytes }
// → { t: "drop", id, key }    → { t: "schema", id, key }    → { t: "forget", id, name }
// ← { t: "ready", id, ms, cache }            ← { t: "dataset", id, name, snapshot, fingerprint, engine, types, setups, ms }
// ← { t: "phase", id, phase }                ← { t: "stmt", id, r }
// ← { t: "done", id, txn, restoreMs, execMs, setupError?, types?, kept }   ← { t: "schema", id, tables }
// ← { t: "fail", id, message }

import { openDb, readSchema, resolveTypes, runSetup, runStatements, seedDataset } from "./engine.js";

const post = (m, transfer) => self.postMessage(m, transfer ?? []);
const now = () => performance.now();

let PGlite = null;
let protocol = null;
/** @type {{ pglite?: WebAssembly.Module; initdb?: WebAssembly.Module }} */
let modules = {};
/** @type {Blob | undefined} */
let fsBundle;
/** @type {Record<string, URL>} */
let extensions = {};
let spareAllowed = false;

/** name → { snapshot, types, setups, engine, fingerprint } */
const datasets = new Map();
/** playground sessions that keep their database between runs: key → { db, name } */
const sessions = new Map();
/** a database restored ahead of time for the next run on the same dataset */
let spare = null;

const isGz = (b) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`couldn't download ${url.split("/").pop()} (http ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function compile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`couldn't download ${url.split("/").pop()} (http ${res.status})`);
  if (typeof WebAssembly.compileStreaming === "function" && /application\/wasm/.test(res.headers.get("content-type") ?? "")) {
    return WebAssembly.compileStreaming(res);
  }
  return WebAssembly.compile(await res.arrayBuffer());
}

const gunzip = (bytes) => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).blob();
const gzip = (bytes) => new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).blob();

async function init(m) {
  const t0 = now();
  const base = new URL(m.base, self.location.href).href;
  spareAllowed = !!m.spare;
  post({ t: "phase", id: m.id, phase: "download" });
  const modP = import(base + "index.js");
  /** @type {Record<string, Blob>} */
  let extBlobs;
  if (m.cache) {
    modules = { pglite: m.cache.pglite, initdb: m.cache.initdb };
    fsBundle = m.cache.fsBundle;
    extBlobs = m.cache.ext;
  } else {
    const [pglite, initdb, data, ...ext] = await Promise.all([
      compile(base + "pglite.wasm"),
      compile(base + "initdb.wasm"),
      fetchBytes(base + "pglite.data.gz"),
      ...m.ext.map((e) => fetchBytes(`${base}${e}.tar.gz`)),
    ]);
    modules = { pglite, initdb };
    // a host that adds Content-Encoding hands us plain bytes; either way fsBundle is the raw data
    fsBundle = isGz(data) ? await gunzip(data) : new Blob([data]);
    // PGlite gunzips extension bundles itself, so keep (or make) them gzipped
    extBlobs = Object.fromEntries(await Promise.all(m.ext.map(async (e, i) => [e, isGz(ext[i]) ? new Blob([ext[i]]) : await gzip(ext[i])])));
  }
  extensions = Object.fromEntries(Object.entries(extBlobs).map(([e, b]) => [e, new URL(URL.createObjectURL(b))]));
  const mod = await modP;
  PGlite = mod.PGlite;
  protocol = mod.protocol;
  post({ t: "ready", id: m.id, ms: Math.round(now() - t0), cache: { pglite: modules.pglite, initdb: modules.initdb, fsBundle, ext: extBlobs } });
}

async function dataset(m) {
  if (m.snapshot) {
    datasets.set(m.name, { snapshot: m.snapshot, types: m.types, setups: m.setups, engine: m.engine, fingerprint: m.fingerprint });
    post({ t: "dataset", id: m.id, name: m.name, cached: true });
    return;
  }
  const t0 = now();
  post({ t: "phase", id: m.id, phase: "download" });
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`couldn't download the ${m.name} dataset (http ${res.status})`);
  const ds = await res.json();
  const out = await seedDataset(PGlite, protocol, ds, {
    extensions,
    modules,
    fsBundle,
    compression: m.compression ?? "none",
    onPhase: (phase) => post({ t: "phase", id: m.id, phase }),
  });
  const entry = { snapshot: out.snapshot, types: out.types, setups: ds.setups ?? {}, engine: out.engine, fingerprint: out.fingerprint };
  datasets.set(m.name, entry);
  post({ t: "dataset", id: m.id, name: m.name, ...entry, ms: Math.round(now() - t0) });
}

function makeSpare(name) {
  if (!spareAllowed || spare) return;
  const ds = datasets.get(name);
  if (!ds) return;
  const promise = openDb(PGlite, { snapshot: ds.snapshot, extensions, modules, fsBundle }).catch(() => null);
  spare = { name, promise };
}

async function takeDb(name) {
  if (spare) {
    const s = spare;
    spare = null;
    const db = await s.promise;
    if (s.name === name && db) return db;
    db?.close().catch(() => {});
  }
  const ds = datasets.get(name);
  return openDb(PGlite, { snapshot: ds.snapshot, extensions, modules, fsBundle });
}

async function run(m) {
  const ds = datasets.get(m.db);
  if (!ds) throw new Error(`the ${m.db} dataset isn't loaded`);
  let db = null;
  let kept = false;
  let restoreMs = 0;
  if (m.key) {
    const s = sessions.get(m.key);
    if (s && !m.fresh && s.name === m.db) {
      db = s.db;
      kept = true;
    } else if (s) {
      sessions.delete(m.key);
      await s.db.close().catch(() => {});
    }
  }
  if (!db) {
    post({ t: "phase", id: m.id, phase: "restore" });
    const t0 = now();
    db = await takeDb(m.db);
    restoreMs = Math.round(now() - t0);
    if (m.key) sessions.set(m.key, { db, name: m.db });
  }
  let setupError;
  if (!kept) {
    post({ t: "phase", id: m.id, phase: "setup" });
    const setup = (m.setup ?? []).map((name) => ({ name, statements: ds.setups?.[name] ?? [] }));
    setupError = (await runSetup(db, protocol, { ext: m.ext, setup, prelude: m.prelude })).setupError;
  }
  post({ t: "phase", id: m.id, phase: "run" });
  const t1 = now();
  let txn = "I";
  let types;
  if (!setupError) {
    const out = await runStatements(db, protocol, m.stmts, {
      maxRows: m.maxRows,
      maxBytes: m.maxBytes,
      errors: m.errors,
      types: ds.types,
      onStatement: (r) => post({ t: "stmt", id: m.id, r }),
    });
    txn = out.txn;
    // names of types the reader created. only now, after their last statement
    if (out.unknownTypes.size) types = await resolveTypes(db, protocol, [...out.unknownTypes]).catch(() => undefined);
  }
  const execMs = Math.round(now() - t1);
  if (!m.key) await db.close().catch(() => {});
  post({ t: "done", id: m.id, txn, restoreMs, execMs, setupError, types, kept });
  if (!m.key) makeSpare(m.db);
}

/** the page dropped this dataset's snapshot to save memory: drop ours too */
async function forget(m) {
  datasets.delete(m.name);
  if (spare?.name === m.name) {
    const s = spare;
    spare = null;
    s.promise.then((db) => db?.close()).catch(() => {});
  }
  post({ t: "done", id: m.id, txn: "I", restoreMs: 0, execMs: 0 });
}

async function drop(m) {
  const s = sessions.get(m.key);
  if (s) {
    sessions.delete(m.key);
    await s.db.close().catch(() => {});
  }
  post({ t: "done", id: m.id, txn: "I", restoreMs: 0, execMs: 0 });
}

async function schema(m) {
  const s = sessions.get(m.key);
  const tables = s ? await readSchema(s.db, protocol) : null;
  post({ t: "schema", id: m.id, tables });
}

const handlers = { init, dataset, run, drop, schema, forget };

// one message at a time, in order
let queue = Promise.resolve();
self.onmessage = (e) => {
  const m = e.data;
  queue = queue.then(async () => {
    try {
      const h = handlers[m?.t];
      if (!h) throw new Error(`unknown message ${m?.t}`);
      await h(m);
    } catch (err) {
      post({ t: "fail", id: m?.id, message: String(err?.message ?? err) });
    }
  });
};
