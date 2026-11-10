import type { SqlBlockData } from "../types";

export type SqlBlock = SqlBlockData & { index: number; line: number; issues: string[] };

export function stripNotation(code: string): string;
export function tokenizeMeta(meta: string): { key: string; value?: string; raw: string }[];
export function collectSqlBlocks(
  items: { lang?: string | null; meta?: string | null; value: string; line: number }[],
  opts?: { datasets?: string[]; setups?: Record<string, string[]> },
): SqlBlock[];
export function blockData(b: SqlBlock): SqlBlockData;
