"use client";

// goldens: the real output of every runnable block, recorded by `pnpm sql-check --update` into
// content/<part>/<chapter>.golden.json. the chapter page loads the file and provides it here,
// so a block shows postgres' answer before anyone presses run (and in the static html).

import { createContext, useContext, type ReactNode } from "react";
import type { GoldenBlock, GoldenStatement, SqlRunView, StatementResult } from "./types";

const GoldenContext = createContext<Record<string, GoldenBlock>>({});

export function GoldenProvider({ value, children }: { value: Record<string, GoldenBlock> | null | undefined; children: ReactNode }) {
  return <GoldenContext.Provider value={value ?? {}}>{children}</GoldenContext.Provider>;
}

/** the recorded output for a block id, if there is one */
export function useGolden(id: string | undefined): GoldenBlock | undefined {
  const all = useContext(GoldenContext);
  return id ? all[id] : undefined;
}

/** a golden as a run view, so ResultGrid can draw it like a live result */
export function goldenToView(g: GoldenBlock, splitSql?: (sql: string) => { sql: string; offset: number }[]): SqlRunView {
  const stmts = splitSql ? splitSql(g.sql) : [];
  const statements: StatementResult[] = g.statements.map((s: GoldenStatement, i) => ({
    i,
    sql: s.sql ?? stmts[i]?.sql ?? "",
    offset: s.offset ?? stmts[i]?.offset ?? 0,
    command: s.command,
    tag: s.tag,
    rowCount: s.rowCount,
    columns: s.columns ? s.columns.map(([name, type, oid]) => ({ name, type, oid, typmod: -1 })) : null,
    rows: s.rows ?? [],
    // a golden keeps 50 rows: say how many there really were
    truncated:
      s.truncated ??
      (s.columns && s.rowCount !== null && s.rowCount > (s.rows ?? []).length ? { kept: (s.rows ?? []).length, total: s.rowCount } : undefined),
    copyOut: s.copyOut,
    notices: s.notices ?? [],
    error: s.error,
    ms: 0,
  }));
  return { statements, error: g.error ?? undefined, txn: g.txn };
}
