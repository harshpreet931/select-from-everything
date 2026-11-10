// what a run of sql produces. the same shapes come out of the browser worker and sql-check
// (both go through public/sql/engine.js), and goldens store a trimmed copy.

/** a value in postgres' text output format, never parsed. null is SQL NULL */
export type Value = string | null;

/** type: the type's name (int4, text, numeric, timestamptz, text[]); oid and typmod as sent by the server */
export type Column = { name: string; type: string; oid: number; typmod: number };

export type Notice = { severity: string; sqlstate: string; message: string; detail?: string; hint?: string; where?: string };

export type SqlError = {
  severity: string;
  sqlstate: string;
  message: string;
  detail?: string;
  hint?: string;
  where?: string;
  /** 1-based, in characters of the statement */
  position?: number;
  internalPosition?: number;
  internalQuery?: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
  dataType?: string;
};

export type StatementResult = {
  /** 0-based index in the block */
  i: number;
  sql: string;
  /** utf-16 offset of the statement in the block */
  offset: number;
  /** first word(s) of the tag: SELECT, INSERT, CREATE TABLE */
  command: string;
  /** the command tag as sent: SELECT 3, INSERT 0 1, CREATE TABLE */
  tag: string;
  rowCount: number | null;
  columns: Column[] | null;
  rows: Value[][];
  /** fewer rows kept than returned. total from the tag, null if unknown */
  truncated?: { kept: number; total: number | null };
  /** COPY ... TO STDOUT text */
  copyOut?: string;
  notices: Notice[];
  error?: SqlError;
  ms: number;
};

export type SqlRunView = { statements: StatementResult[]; error?: SqlError & { statement: number }; txn?: "I" | "T" | "E" };

export type SqlRunResult = SqlRunView & {
  ok: boolean;
  db: string;
  engine: string;
  restoreMs: number;
  execMs: number;
  timedOut?: boolean;
  aborted?: boolean;
  /** a kept playground session died (timeout, crash): this run started from a fresh copy */
  sessionLost?: boolean;
  /** index of the statement that was running when the run was stopped */
  running?: number;
  setupError?: SqlError & { sql: string };
  /** the engine itself failed: couldn't load, crashed, ran out of memory */
  fatal?: string;
  /** the browser's copy of the dataset differs from the one the book was checked against */
  fingerprintMismatch?: boolean;
};

/** what a golden stores per statement: at most 50 rows, plus a digest of the full canonical result */
export type GoldenStatement = {
  tag: string;
  command: string;
  columns: [name: string, type: string, oid: number][] | null;
  /** only when there are columns; at most 50 */
  rows?: Value[][];
  rowCount: number | null;
  /** only when there were any */
  notices?: Notice[];
  error?: SqlError;
  copyOut?: string;
  truncated?: { kept: number; total: number | null };
  digest: string;
  /** the statement text (only stored when it isn't obvious from the block) */
  sql?: string;
  offset?: number;
};

export type GoldenBlock = {
  db: string;
  sql: string;
  statements: GoldenStatement[];
  error: (SqlError & { statement: number }) | null;
  txn: "I" | "T" | "E";
  /** where the golden came from when it isn't the browser engine */
  engine?: string;
};

export type GoldenFile = { v: 1; engine: string; blocks: Record<string, GoldenBlock> };

/** the part of a fence's meta the page needs (data-sql on the <pre>) */
export type SqlBlockData = {
  id: string;
  sql: string;
  run: boolean;
  hidden: boolean;
  native: boolean;
  nocheck: boolean;
  db: string;
  session?: string;
  ext: string[];
  setup: string[];
  prelude: { id: string; sql: string; errors: "stop" | "continue" }[];
  flags: { unordered?: true; expect?: "error"; errors?: "continue"; volatile?: true; rows?: number };
};
