// what the browser engine (PGlite: postgres compiled to webassembly, one backend, no background
// processes) can't run, and where its answer can differ from a real server. for "can't run" the
// run button goes away and the block says why; a caveat is a one-line note under the result.
// regexes run on masked sql (strings and comments blanked), so a word in a string never matches.

import { maskSql } from "./split.mjs";

/** extension bundles shipped to the browser. CREATE EXTENSION works for these, and only these. */
export const EXTENSIONS = ["pageinspect", "pg_buffercache", "pg_visibility", "pg_walinspect", "amcheck", "pg_freespacemap", "pg_trgm", "btree_gist", "ltree"];

/** @type {[RegExp, string][]} */
const cantRun = [
  [/^[ \t]*\\/m, "a psql meta-command (those are psql's, not the server's)"],
  [/\bCOPY\b[^;]*?\bFROM\s+(STDIN|PROGRAM|')/i, "COPY ... FROM, which needs a client to send the data or a file on the server"],
  [/\bCOPY\b[^;]*?\bTO\s+(PROGRAM|')/i, "COPY ... TO a file, which writes on the server's disk"],
  [/\bpg_(terminate|cancel)_backend\s*\(/i, "another connection, and the browser engine only has one"],
  // a physical slot is just a reservation PGlite can make (pg_create_physical_replication_slot
  // returns one); streaming from it, or decoding a logical slot, needs a second server
  [/\bpg_create_logical_replication_slot\b|\bpg_logical_slot_\w+\b|\bCREATE_REPLICATION_SLOT\b[^;]*\bLOGICAL\b|\bSTART_REPLICATION\b/i, "replication, which needs a second server"],
  [/\bdblink\b|\bpostgres_fdw\b/i, "a connection to another server"],
  [/\bALTER\s+SYSTEM\b/i, "ALTER SYSTEM, which edits a config file and needs a restart"],
];

/**
 * null when the browser engine can run it, otherwise a short lowercase reason.
 * @param {string} code
 */
export function sqlCantRun(code) {
  const m = maskSql(code);
  for (const [re, why] of cantRun) if (re.test(m)) return why;
  for (const x of m.matchAll(/\bCREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?("?)([A-Za-z0-9_-]+)\1/gi)) {
    if (!EXTENSIONS.includes(x[2].toLowerCase())) return `the ${x[2]} extension, which isn't in the browser engine`;
  }
  return null;
}

/** @type {[RegExp, string][]} */
const caveats = [
  [/\bCOLLATE\b|\blc_collate\b/i, "the browser engine's default collation is C (byte order). it has the ICU root collations (\"unicode\", und-x-icu), but no language-specific ones, so a server set up with a language collation can sort differently."],
  [/\bEXPLAIN\s*\([^)]*\bANALY[SZ]E\b|\bEXPLAIN\s+ANALY[SZ]E\b/i, "timings in EXPLAIN ANALYZE are your machine's, through webassembly. read the plan shape and row counts, not the milliseconds."],
  [/\b(now|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday|random|random_normal|gen_random_uuid|uuidv4|uuidv7)\s*\(|\bcurrent_timestamp\b|\blocaltimestamp\b/i, "this uses the clock or randomness, so your run gives different values than the book's."],
  [/\bpg_stat_\w+|\bautovacuum\b|\bparallel\b|\bio_method\b|\bbgwriter\b|\bcheckpointer\b/i, "the browser engine has no background processes (no autovacuum, no parallel workers, no background writer), so these numbers can differ from a server."],
  [/\bpg_buffercache\b/i, "the buffer pool starts empty on every run here, so the cached pages are only what this run touched."],
];

/**
 * null when the browser's answer should match a real postgres 18 server, otherwise one line.
 * @param {string} code
 */
export function sqlCaveat(code) {
  const m = maskSql(code);
  // EXPLAIN (ANALYZE, TIMING OFF) prints no timings to differ
  const noTiming = /\bTIMING\s+(OFF|FALSE|0)\b/i.test(m);
  for (const [re, why] of caveats) {
    if (noTiming && why.startsWith("timings")) continue;
    if (re.test(m)) return why;
  }
  return null;
}
