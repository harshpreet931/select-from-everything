// run sql in the browser: a real postgres 18 (PGlite, compiled to webassembly) in a web worker.
// every run starts from a fresh copy of a dataset snapshot, so blocks never see each other's
// changes unless they're in one session chain. the worker is public/sql/sql.worker.js (plain js,
// not bundled) and it shares public/sql/engine.js with sql-check, so the browser and the book's
// goldens come from the same code.
//
// nothing here touches window or Worker at import time, and runSql never throws: problems land
// in the result.

import manifest from "./datasets.gen.json";
import { splitSql } from "./shared/split.mjs";
import { sessionText } from "./session";
import type { SqlError, SqlRunResult, StatementResult } from "./types";

export type { SqlRunResult, SqlRunView, StatementResult, SqlError, Column, Value, Notice } from "./types";

export type SqlStatus = "idle" | "loading" | "ready" | "error";

export type SqlInput =
  | string
  | {
      sql: string;
      /** dataset name, default "empty" */
      db?: string;
      /** CREATE EXTENSION IF NOT EXISTS before anything else */
      ext?: string[];
      /** dataset setups to apply (datasets/<db>/setup/<name>.sql) */
      setup?: string[];
      /** earlier blocks of a session chain. an entry with an id runs the reader's edited text if there is one */
      prelude?: { id?: string; sql: string; errors?: "stop" | "continue" }[];
      /** keep the database between runs under this key (the playground). reset with resetSql(key) */
      keep?: string;
    };

export type RunSqlOptions = {
  /** wall clock limit once the run starts, default 10 s (the playground uses 30 s) */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** rows kept per statement, default 1,000 */
  maxRows?: number;
  /** bytes of values kept per run, default 2 MB */
  maxBytes?: number;
  errors?: "stop" | "continue";
  onStatement?: (r: StatementResult) => void;
};

type DatasetInfo = (typeof manifest.datasets)[keyof typeof manifest.datasets];
export const sqlManifest = manifest;
export const datasets = manifest.datasets as Record<string, DatasetInfo>;
export const datasetNames = Object.keys(manifest.datasets);

const INIT_TIMEOUT_MS = 180_000; // first load is about 6 MB: give slow networks room
const DATASET_TIMEOUT_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_SNAPSHOTS = 3;

// ---------- config ----------

let assetBase = "/sql/";

/** where public/sql/ is served from. only needed with a basePath */
export function configureSql(o: { assetBase?: string }): void {
  if (o.assetBase) assetBase = o.assetBase.endsWith("/") ? o.assetBase : o.assetBase + "/";
}

const abs = (p: string) => new URL(p, new URL(assetBase, self.location.href)).href;

/** web workers, webassembly and gzip streams: everything the engine needs */
export function isSqlSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof WebAssembly === "object" &&
    typeof DecompressionStream !== "undefined" &&
    typeof CompressionStream !== "undefined"
  );
}

/** phones and small machines: no spare database, gzipped snapshots */
function lowMemory(): boolean {
  if (typeof navigator === "undefined") return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios || (mem !== undefined && mem < 4);
}

// ---------- status ----------

let status: SqlStatus = "idle";
let phase: string | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) {
    try {
      l();
    } catch {}
  }
};
const setStatus = (s: SqlStatus) => {
  if (s !== status) {
    status = s;
    emit();
  }
};
const setPhase = (p: string | null) => {
  if (p !== phase) {
    phase = p;
    emit();
  }
};

export function sqlStatus(): SqlStatus {
  return status;
}
/** what the engine is doing right now: download, initdb, seed, restore, setup, run. null when idle */
export function sqlPhase(): string | null {
  return phase;
}
/** the subscribe half of useSyncExternalStore, for both sqlStatus and sqlPhase */
export function subscribeSqlStatus(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// ---------- the worker ----------

type Cache = { pglite: WebAssembly.Module; initdb: WebAssembly.Module; fsBundle: Blob; ext: Record<string, Blob> };
type Snapshot = { snapshot: Blob; types: Record<string, string>; setups: Record<string, string[]>; engine: string; fingerprint: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = { t: string; id: number; [k: string]: any };
type Pending = { resolve: (m: Msg) => void; reject: (e: Error) => void; onEvent?: (m: Msg) => void };

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let cache: Cache | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
/** datasets the current worker has (seeded or handed a snapshot) */
const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();
/** snapshots kept on the page, so a new worker gets them without seeding again. most recent last */
const snapshots = new Map<string, Snapshot>();
const mismatched = new Set<string>();
/** playground sessions alive in the current worker, and ones a killed worker took with it */
const liveSessions = new Set<string>();
const lostSessions = new Set<string>();
let engineName: string = manifest.engine;

function kill(reason: string) {
  worker?.terminate();
  worker = null;
  ready = null;
  loaded.clear();
  loading.clear();
  for (const k of liveSessions) lostSessions.add(k);
  liveSessions.clear();
  const err = new Error(reason);
  for (const p of pending.values()) p.reject(err);
  pending.clear();
  setPhase(null);
  setStatus(cache ? "ready" : "idle");
}

function send(msg: Omit<Msg, "id">, opts: { timeoutMs?: number; onEvent?: (m: Msg) => void; transfer?: Transferable[] } = {}): Promise<Msg> {
  const w = worker;
  if (!w) return Promise.reject(new Error("the database worker isn't running"));
  const id = ++seq;
  return new Promise<Msg>((resolve, reject) => {
    const timer = opts.timeoutMs
      ? setTimeout(() => kill(`the database didn't answer within ${Math.round(opts.timeoutMs! / 1000)} s, so it was restarted`), opts.timeoutMs)
      : undefined;
    pending.set(id, {
      resolve: (m) => {
        clearTimeout(timer);
        resolve(m);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
      onEvent: opts.onEvent,
    });
    w.postMessage({ ...msg, id }, opts.transfer ?? []);
  });
}

function onMessage(e: MessageEvent<Msg>) {
  const m = e.data;
  const p = pending.get(m?.id);
  if (m.t === "phase") setPhase(m.phase);
  if (!p) return;
  if (m.t === "phase" || m.t === "stmt") {
    p.onEvent?.(m);
    return;
  }
  pending.delete(m.id);
  if (m.t === "fail") p.reject(new Error(m.message));
  else p.resolve(m);
}

function ensureWorker(): Promise<void> {
  if (ready) return ready;
  if (!isSqlSupported()) {
    setStatus("error");
    return Promise.reject(new Error("this browser can't run the database: it needs web workers, webassembly and compression streams"));
  }
  if (!cache) setStatus("loading");
  const w = new Worker(abs("sql.worker.js"), { type: "module", name: "sql" });
  worker = w;
  w.onmessage = onMessage;
  w.onerror = (e) => {
    e.preventDefault();
    if (worker === w) kill("the database crashed" + (e.message ? `: ${e.message}` : ""));
  };
  const low = lowMemory();
  const p: Promise<void> = send(
    { t: "init", base: abs(manifest.assets), ext: manifest.extensions, spare: !low, cache: cache ?? undefined },
    { timeoutMs: INIT_TIMEOUT_MS },
  )
    .then((m) => {
      cache = m.cache;
      setPhase(null);
      setStatus("ready");
    })
    .catch((err: Error) => {
      if (ready === p) kill(err.message);
      setStatus("error");
      throw err;
    });
  ready = p;
  p.catch(() => {});
  return p;
}

function ensureDataset(name: string): Promise<void> {
  if (loaded.has(name)) return Promise.resolve();
  const inflight = loading.get(name);
  if (inflight) return inflight;
  const info = datasets[name];
  const kept = snapshots.get(name);
  const p = send(
    {
      t: "dataset",
      name,
      url: abs(info.url),
      hash: info.hash,
      fingerprint: info.fingerprint,
      compression: lowMemory() ? "gzip" : "none",
      ...(kept ?? {}),
    },
    { timeoutMs: DATASET_TIMEOUT_MS },
  )
    .then((m) => {
      if (!m.cached) {
        const snap: Snapshot = { snapshot: m.snapshot, types: m.types, setups: m.setups, engine: m.engine, fingerprint: m.fingerprint };
        if (m.engine) engineName = m.engine;
        if (m.fingerprint !== info.fingerprint) mismatched.add(name);
        snapshots.delete(name);
        snapshots.set(name, snap);
        while (snapshots.size > MAX_SNAPSHOTS) {
          const oldest = snapshots.keys().next().value as string;
          snapshots.delete(oldest);
          if (loaded.delete(oldest)) void send({ t: "forget", name: oldest }).catch(() => {});
        }
      } else {
        // touch: most recently used goes last
        const s = snapshots.get(name);
        if (s) {
          snapshots.delete(name);
          snapshots.set(name, s);
        }
      }
      loaded.add(name);
      setPhase(null);
    })
    .finally(() => loading.delete(name));
  loading.set(name, p);
  return p;
}

/** downloads the engine, and builds a dataset when given one. idempotent; safe to call on hover */
export function preloadSql(db?: string): Promise<void> {
  const p = ensureWorker().then(() => (db && datasets[db] ? ensureDataset(db) : undefined));
  p.catch(() => {});
  return p;
}

// ---------- runs ----------

let queue: Promise<unknown> = Promise.resolve();

const split = (sql: string) => splitSql(sql).map((s) => ({ sql: s.sql, offset: s.offset }));

/** run sql. a string runs on a fresh empty database. never throws */
export function runSql(input: SqlInput, opts: RunSqlOptions = {}): Promise<SqlRunResult> {
  const o = typeof input === "string" ? { sql: input } : input;
  const db = o.db ?? "empty";
  const result: SqlRunResult = { ok: false, statements: [], db, engine: engineName, restoreMs: 0, execMs: 0 };
  const job = queue.then(() => execute(o, db, opts, result));
  queue = job.catch(() => {});
  return job.then(
    () => result,
    (e: Error) => {
      result.fatal = e.message;
      return result;
    },
  );
}

async function execute(o: Exclude<SqlInput, string>, db: string, opts: RunSqlOptions, result: SqlRunResult) {
  if (!isSqlSupported()) {
    result.fatal = "this browser can't run the database: it needs web workers, webassembly and compression streams";
    return;
  }
  if (!datasets[db]) {
    result.fatal = `there's no dataset called ${db}`;
    return;
  }
  if (opts.signal?.aborted) {
    result.aborted = true;
    return;
  }
  try {
    await ensureWorker();
    await ensureDataset(db);
  } catch (e) {
    result.fatal = `couldn't start the database: ${(e as Error).message}`;
    return;
  }
  result.engine = engineName;
  if (mismatched.has(db)) result.fingerprintMismatch = true;

  const stmts = split(o.sql);
  const prelude = (o.prelude ?? []).map((p) => ({
    stmts: split((p.id ? sessionText(p.id) : undefined) ?? p.sql),
    errors: p.errors ?? "stop",
  }));
  let fresh = true;
  if (o.keep) {
    fresh = !liveSessions.has(o.keep);
    if (lostSessions.delete(o.keep)) result.sessionLost = true;
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped: "timeout" | "abort" | null = null;
  const stop = (why: "timeout" | "abort") => {
    if (stopped) return;
    stopped = why;
    kill(why === "timeout" ? "stopped: out of time" : "stopped");
    // a fresh worker, so the next run doesn't pay for the restart
    void ensureWorker().then(() => ensureDataset(db)).catch(() => {});
  };
  const onAbort = () => stop("abort");
  opts.signal?.addEventListener("abort", onAbort);

  try {
    const done = await send(
      {
        t: "run",
        db,
        fresh,
        key: o.keep,
        ext: o.ext ?? [],
        setup: o.setup ?? [],
        prelude,
        stmts,
        errors: opts.errors ?? "stop",
        maxRows: opts.maxRows ?? 1000,
        maxBytes: opts.maxBytes ?? 2_000_000,
      },
      {
        onEvent: (m) => {
          if (m.t === "phase" && (m.phase === "setup" || m.phase === "run") && !timer) {
            timer = setTimeout(() => stop("timeout"), timeoutMs);
          }
          if (m.t === "stmt") {
            const r = m.r as StatementResult;
            result.statements.push(r);
            opts.onStatement?.(r);
          }
        },
      },
    );
    if (o.keep) liveSessions.add(o.keep);
    result.txn = done.txn;
    result.restoreMs = done.restoreMs;
    result.execMs = done.execMs;
    if (done.setupError) result.setupError = done.setupError;
    if (done.types) {
      for (const s of result.statements) {
        for (const c of s.columns ?? []) if (done.types[c.oid]) c.type = done.types[c.oid];
      }
    }
  } catch (e) {
    if (stopped === "timeout") {
      result.timedOut = true;
      result.running = result.statements.length;
    } else if (stopped === "abort") {
      result.aborted = true;
      result.running = result.statements.length;
    } else result.fatal = (e as Error).message;
    if (o.keep && !result.sessionLost) {
      // the session died with the worker; the next run starts fresh and says so
      lostSessions.add(o.keep);
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    setPhase(null);
  }

  const firstError = result.statements.find((s) => s.error);
  if (firstError?.error) result.error = { ...(firstError.error as SqlError), statement: firstError.i };
  result.ok = !result.error && !result.setupError && !result.timedOut && !result.aborted && !result.fatal;
}

/** forget a kept playground database. the next run with this key starts from the dataset again */
export async function resetSql(key: string): Promise<void> {
  lostSessions.delete(key);
  if (!liveSessions.delete(key) || !worker) return;
  try {
    await (queue = queue.then(() => send({ t: "drop", key })).catch(() => {}));
  } catch {}
}

export type SchemaTable = { name: string; kind: string; rows: number | null; columns: { name: string; type: string; notNull?: boolean; pk?: boolean; fk?: string }[] };

/** tables in a kept playground database (after the reader created some). null when there's no such session */
export async function sqlSchema(key: string): Promise<SchemaTable[] | null> {
  if (!liveSessions.has(key) || !worker) return null;
  const job = queue.then(() => send({ t: "schema", key }));
  queue = job.catch(() => {});
  try {
    return ((await job).tables as SchemaTable[] | null) ?? null;
  } catch {
    return null;
  }
}

/** true once the engine has been downloaded on this page (runs are fast from here on) */
export function sqlWarm(): boolean {
  return !!cache;
}
