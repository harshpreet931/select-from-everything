"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  isSqlSupported,
  preloadSql,
  runSql,
  sqlPhase,
  sqlStatus,
  subscribeSqlStatus,
  type RunSqlOptions,
  type SqlInput,
  type SqlRunResult,
  type SqlStatus,
  type StatementResult,
} from "@/lib/sql";
import { msBucket } from "@/lib/analytics";

const saveData = () => {
  try {
    return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  } catch {
    return false;
  }
};

/** one runnable block's state: the shared engine's status, statements as they finish, the last result */
export function useSqlRunner() {
  const status = useSyncExternalStore<SqlStatus>(subscribeSqlStatus, sqlStatus, () => "idle");
  const phase = useSyncExternalStore<string | null>(subscribeSqlStatus, sqlPhase, () => null);
  const [supported, setSupported] = useState(true);
  const [running, setRunning] = useState(false);
  const [partial, setPartial] = useState<StatementResult[]>([]);
  const [result, setResult] = useState<SqlRunResult | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => setSupported(isSqlSupported()), []);
  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async (input: SqlInput, opts: RunSqlOptions = {}) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setRunning(true);
    setResult(null);
    setPartial([]);
    try {
      const r = await runSql(input, {
        ...opts,
        signal: ctl.signal,
        onStatement: (s) => setPartial((p) => [...p, s]),
      });
      if (abort.current === ctl || r.aborted) {
        setResult(r);
      }
      return r;
    } finally {
      if (abort.current === ctl) setRunning(false);
    }
  }, []);

  const stop = useCallback(() => abort.current?.abort(), []);
  /** start downloading the engine (and build a dataset) before the click. skipped on save-data connections */
  const warm = useCallback((db?: string) => {
    if (isSqlSupported() && !saveData()) void preloadSql(db).catch(() => {});
  }, []);
  const clear = useCallback(() => {
    setResult(null);
    setPartial([]);
  }, []);

  return { status, phase, supported, running, partial, result, run, stop, warm, clear };
}

export type SqlRunner = ReturnType<typeof useSqlRunner>;

/** a run, reduced to what analytics may know: how it ended, how long, which error class. never the sql */
export function runSummary(r: SqlRunResult) {
  const err = r.setupError ?? r.error;
  return {
    result: r.fatal ? "fatal" : r.timedOut ? "timeout" : r.aborted ? "stopped" : r.setupError ? "setup_error" : r.ok ? "ok" : "error",
    ms: msBucket(r.restoreMs + r.execMs),
    sqlstate: err?.sqlstate || undefined,
    statements: r.statements.length,
    db: r.db,
  };
}

/** what the engine is doing, in words */
export function phaseText(phase: string | null, status: SqlStatus, db?: string): string {
  switch (phase) {
    case "download":
      return status === "loading" ? "downloading postgres (once per visit)…" : "loading…";
    case "initdb":
      return "creating a database…";
    case "seed":
      return db && db !== "empty" ? `loading the ${db} data…` : "getting the database ready…";
    case "restore":
      return db ? `copying a fresh ${db} database…` : "copying a fresh database…";
    case "setup":
      return "running the setup…";
    case "run":
      return "running…";
    default:
      return status === "loading" ? "downloading postgres (once per visit)…" : "running…";
  }
}
