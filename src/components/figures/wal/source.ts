import type { PgStep, PgTrace } from "@/lib/db/pgtrace";

// shared helpers for this part's figures. figures that only read a capture are server
// components: they pick the slice a client figure needs, so the whole trace never ships twice.

/** what <Provenance trace={...} /> needs, and nothing else */
export const prov = (t: Pick<PgTrace, "engine" | "scenario">) => ({ engine: { version: t.engine.version, build: t.engine.build }, scenario: t.scenario });

/** "0/161FFE8" → number */
export function parseLsn(s: string): number {
  const [hi, lo] = s.split("/");
  return parseInt(hi, 16) * 2 ** 32 + parseInt(lo, 16);
}

/** where the next record starts: postgres keeps records 8-byte aligned, and a page's pd_lsn is that position */
export const align8 = (n: number) => Math.ceil(n / 8) * 8;

/** a step's result as plain rows */
export const rows = (st: PgStep | undefined): (string | null)[][] => st?.result?.data ?? [];

/** the statement a step ran, on one line */
export const oneLine = (sql: string) => sql.replace(/\s+/g, " ").trim();
