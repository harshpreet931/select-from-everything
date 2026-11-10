// the capture schema. tools/pgtrace runs a scenario against a real postgres and writes one
// of these per scenario (`x.pgtrace.json` next to `x.scenario.sql`). figures draw from it
// through the adapters in fromTrace.ts. keep this file in sync with the capture tool:
// change a field here and the tool, the adapters and the fixtures all move together.
//
// LSNs are plain numbers (the tool asserts they stay below 2^53). xids are numbers.
// values are the raw values postgres reported; display normalisation (xid aliases like
// "754 (T1)", LSN offsets from base) happens in the adapters, never in the capture.

import type { Snap, XactStatus, Page, Tid } from "./views";

export type PgTrace = {
  v: 1;
  scenario: string;
  title: string;
  /** build: set when the capture ran on an embedded build ("PGlite 0.5.12"); absent for a native server */
  engine: { version: string; major: number; blockSize: number; walBlockSize: number; segSize: number; checksums: boolean; ioMethod: string; build?: string };
  server: Record<string, string>;
  sessions: string[];
  rels: Record<string, { kind: "table" | "index"; am: string; columns?: { name: string; type: string }[] }>;
  base: { xid: number; lsn: number };
  setup: string;
  steps: PgStep[];
};

export type PgStep = {
  i: number;
  session: string;
  sql: string;
  note?: string;
  status: "ok" | "blocked" | "error";
  result?: { command: string; rows: number | null; columns: { name: string; type: string }[]; data: (string | null)[][] };
  error?: { sqlstate: string; message: string; detail?: string };
  blocked?: { by: string[]; lock: PgLock };
  woke?: { session: string; step: number; result?: PgStep["result"]; error?: PgStep["error"] }[];
  xids?: Record<string, { xid: number | null; snap: Snap | null; iso: string; inTxn: boolean }>;
  xact?: Record<number, XactStatus>;
  heap?: Record<string, Page[]>;
  btree?: Record<
    string,
    {
      root: number;
      levels: number;
      pages: {
        blk: number;
        type: "r" | "i" | "l";
        level: number;
        prev: number;
        next: number;
        high?: string;
        items: { off: number; key: string; tid?: Tid; tids?: Tid[]; dead: boolean }[];
      }[];
    }
  >;
  hash?: Record<string, { meta: Record<string, number>; pages: { blk: number; type: string; bucket?: number; next?: number; items: { off: number; hash: number; tid: Tid }[] }[] }>;
  buffers?: {
    frames: { id: number; rel: string; fork: string; block: number; dirty: boolean; usage: number; pins: number }[];
    other: number;
    summary: { used: number; dirty: number };
  };
  vm?: Record<string, { block: number; allVisible: boolean; allFrozen: boolean }[]>;
  locks?: PgLock[];
  wal?: {
    insert: number;
    flush: number;
    redo: number;
    checkpoint: number;
    records: {
      lsn: number;
      end: number;
      prev: number;
      xid: number;
      rmgr: string;
      type: string;
      len: number;
      fpiLen: number;
      desc: string;
      blocks: { rel: string; block: number; fpi: boolean }[];
      volatile?: boolean;
    }[];
  };
  explain?: unknown;
  stats?: Record<string, Record<string, number>>;
  /** @stages: one real query per clause. sql = the prefix query that produced the table, note = the scenario's words */
  stages?: { clause: string; columns: string[]; /** column types, parallel to columns (captures since fix pass 4) */ types?: string[]; data: (string | null)[][]; sql?: string; note?: string; group?: string }[];
  log?: string[];
  control?: Record<string, string>;
};

export type PgLock = { session: string; type: string; target: string; mode: string; granted: boolean };
