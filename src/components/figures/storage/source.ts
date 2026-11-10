import type { PgStep, PgTrace } from "@/lib/db/pgtrace";

// shared helpers for this part's figures. figures that only read a capture are server
// components: they pick the slice a client figure needs, so the whole trace never ships twice.

/** what <Provenance trace={...} /> needs, and nothing else */
export const prov = (t: Pick<PgTrace, "engine" | "scenario">) => ({ engine: { version: t.engine.version, build: t.engine.build }, scenario: t.scenario });

/** a step's result as plain rows of strings */
export function rows(st: PgStep | undefined): (string | null)[][] {
  return st?.result?.data ?? [];
}

/** a step's result as objects keyed by column name */
export function records(st: PgStep | undefined): Record<string, string | null>[] {
  const cols = st?.result?.columns.map((c) => c.name) ?? [];
  return rows(st).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

/** the statement a step ran, on one line */
export const oneLine = (sql: string) => sql.replace(/\s+/g, " ").trim();
