// run statements on a native postgres through the `pg` client and collect what psql would show,
// as the runner's StatementResult (src/lib/sql/types.ts). used by pgtrace and `sql-check --engine=native`.
//
// - values stay the server's text, never parsed (RAW_TYPES), rows are arrays.
// - the command tag is the raw CommandComplete text ("INSERT 0 1", "CREATE TABLE"), not node-pg's
//   lossy `command` (which turns "CREATE TABLE" into "CREATE").
// - notices, COPY TO STDOUT data and the transaction status (I / T / E) come straight off the wire.
// - one statement per query, simple protocol, like psql. split the text yourself.
// - an error after some rows drops the rows, like psql.
//
//   instrument(client);                       // once per client (runStatement does it for you)
//   const r = await runStatement(client, "SELECT 1 AS x");
//   const { results, txn } = await runStatements(client, [{ sql, offset }], { errors: "stop" });
//   await resolveTypes(client, results);      // user-defined type names, after the user's statements

import { RAW_TYPES } from "./native-pg.mjs";

export { RAW_TYPES };

const STATE = Symbol("collect-pg");

/**
 * attach wire listeners to a `pg` Client (idempotent). returns the live state:
 * { tags: string[], notices: Notice[], copy: string[], txn: "I" | "T" | "E" }
 */
export function instrument(client) {
  if (client[STATE]) return client[STATE];
  const st = { tags: [], notices: [], copy: [], txn: "I", settled: null, settle: null };
  const con = client.connection;
  con.on("commandComplete", (m) => st.tags.push(m.text));
  con.on("emptyQuery", () => st.tags.push(""));
  // node-pg rejects a failed query on ErrorResponse, before the ReadyForQuery that carries the
  // new transaction status ("E" inside BEGIN). so after an error, the status is pending until
  // that ReadyForQuery arrives: txnStatusSettled() waits for it
  con.on("errorMessage", () => {
    if (!st.settled) st.settled = new Promise((r) => (st.settle = r));
  });
  con.on("readyForQuery", (m) => {
    if (m.status) st.txn = m.status;
    if (st.settle) st.settle();
    st.settled = st.settle = null;
  });
  con.on("copyData", (m) => st.copy.push(Buffer.from(m.chunk).toString("utf8")));
  client.on("notice", (m) => st.notices.push(notice(m)));
  client[STATE] = st;
  return st;
}

/** the transaction status after the last statement: "I" idle, "T" in a transaction, "E" failed transaction */
export function txnStatus(client) {
  return instrument(client).txn;
}

/** the transaction status once any ReadyForQuery still owed after an error has arrived */
export async function txnStatusSettled(client, timeoutMs = 2000) {
  const st = instrument(client);
  if (st.settled) await Promise.race([st.settled, new Promise((r) => setTimeout(r, timeoutMs))]);
  return st.txn;
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

function notice(m) {
  return clean({
    severity: m.severity,
    sqlstate: m.code,
    message: m.message,
    detail: m.detail,
    hint: m.hint,
    where: m.where,
  });
}

/** a node-pg DatabaseError → SqlError */
export function pgError(e) {
  if (!e || !e.code) return { severity: "ERROR", sqlstate: "XX000", message: String(e?.message ?? e) };
  const num = (v) => (v == null || v === "" ? undefined : Number(v));
  return clean({
    severity: e.severity ?? "ERROR",
    sqlstate: e.code,
    message: e.message,
    detail: e.detail,
    hint: e.hint,
    where: e.where,
    position: num(e.position),
    internalPosition: num(e.internalPosition),
    internalQuery: e.internalQuery,
    schema: e.schema,
    table: e.table,
    column: e.column,
    constraint: e.constraint,
    dataType: e.dataType,
  });
}

/** "INSERT 0 1" → { command: "INSERT", rowCount: 1 }, "CREATE TABLE" → { command: "CREATE TABLE", rowCount: null } */
export function tagParts(tag) {
  if (tag == null) return { command: "", rowCount: null };
  let m = /^INSERT \d+ (\d+)$/.exec(tag);
  if (m) return { command: "INSERT", rowCount: Number(m[1]) };
  m = /^(SELECT|UPDATE|DELETE|MERGE|FETCH|MOVE|COPY) (\d+)$/.exec(tag);
  if (m) return { command: m[1], rowCount: Number(m[2]) };
  return { command: tag, rowCount: null };
}

const typeCache = new WeakMap();

/**
 * oid → typname for every built-in type (oid < 16384). loaded once per client, before any user
 * statement runs, so it never reads anything the user's statements could have changed.
 */
export async function loadBuiltinTypes(client) {
  let m = typeCache.get(client);
  if (m) return m;
  const r = await client.query({ text: "SELECT oid::int8::text, typname::text FROM pg_type WHERE oid < 16384", rowMode: "array", types: RAW_TYPES });
  m = new Map(r.rows.map(([oid, name]) => [Number(oid), name]));
  typeCache.set(client, m);
  return m;
}

/** name user-defined column types (oid >= 16384) in place. run it after the user's statements. */
export async function resolveTypes(client, results) {
  const types = await loadBuiltinTypes(client);
  const missing = new Set();
  for (const r of results) for (const c of r.columns ?? []) if (!types.has(c.oid)) missing.add(c.oid);
  if (missing.size) {
    const r = await client.query({
      text: `SELECT oid::int8::text, typname::text FROM pg_type WHERE oid = ANY('{${[...missing].join(",")}}'::oid[])`,
      rowMode: "array",
      types: RAW_TYPES,
    });
    for (const [oid, name] of r.rows) types.set(Number(oid), name);
  }
  for (const r of results) for (const c of r.columns ?? []) c.type = types.get(c.oid) ?? String(c.oid);
  return results;
}

/**
 * run one statement and build its StatementResult.
 * @param {import("pg").Client} client
 * @param {string} sql one statement (simple protocol)
 * @param {{ i?: number, offset?: number, maxRows?: number, maxChars?: number }} [opts]
 *   maxRows: keep the first n rows (rowCount still says how many there were)
 *   maxChars: cut longer values to this many characters and end them with "…"
 */
export async function runStatement(client, sql, { i = 0, offset = 0, maxRows = Infinity, maxChars = Infinity } = {}) {
  const st = instrument(client);
  const types = await loadBuiltinTypes(client);
  st.tags = [];
  st.notices = [];
  st.copy = [];
  const t0 = performance.now();
  /** @type {any} */
  const out = { i, sql, offset, command: "", tag: "", rowCount: null, columns: null, rows: [], notices: [], ms: 0 };
  try {
    let res = await client.query({ text: sql, rowMode: "array", types: RAW_TYPES });
    if (Array.isArray(res)) res = res[res.length - 1];
    const tag = st.tags[st.tags.length - 1] ?? "";
    const { command, rowCount } = tagParts(tag);
    Object.assign(out, { command, tag, rowCount });
    if (res.fields?.length) {
      out.columns = res.fields.map((f) => ({
        name: f.name,
        type: types.get(f.dataTypeID) ?? String(f.dataTypeID),
        oid: f.dataTypeID,
        typmod: f.dataTypeModifier,
      }));
      const all = res.rows;
      let rows = all.length > maxRows ? all.slice(0, maxRows) : all;
      if (Number.isFinite(maxChars))
        rows = rows.map((row) => row.map((v) => (typeof v === "string" && v.length > maxChars ? `${v.slice(0, maxChars)}…` : v)));
      out.rows = rows;
      if (all.length > rows.length) out.truncated = { kept: rows.length, total: rowCount ?? all.length };
    }
    if (st.copy.length) out.copyOut = st.copy.join("");
  } catch (e) {
    out.error = pgError(e);
    out.rows = [];
    out.columns = null;
  }
  out.notices = st.notices.slice();
  out.ms = Math.round((performance.now() - t0) * 100) / 100;
  return out;
}

/**
 * run statements in order on one client.
 * @param {import("pg").Client} client
 * @param {{ sql: string, offset?: number }[]} stmts
 * @param {{ errors?: "stop" | "continue", maxRows?: number, maxBytes?: number, maxChars?: number, onStatement?: (r: any) => void, first?: number }} [opts]
 *   errors "stop": nothing after the first error runs (like psql -v ON_ERROR_STOP=1).
 *   maxBytes: stop keeping rows once the kept values pass this many bytes (rowCount stays exact).
 *   first: the `i` of the first statement (default 0)
 * @returns {Promise<{ results: any[], txn: "I" | "T" | "E" }>}
 */
export async function runStatements(client, stmts, { errors = "stop", maxRows = 1000, maxBytes = 2 << 20, maxChars = Infinity, onStatement, first = 0 } = {}) {
  const results = [];
  let bytes = 0;
  for (let k = 0; k < stmts.length; k++) {
    const { sql, offset = 0 } = stmts[k];
    const budget = Math.max(0, maxBytes - bytes);
    const r = await runStatement(client, sql, { i: first + k, offset, maxRows, maxChars });
    // byte budget: keep whole rows while they fit
    if (r.rows.length) {
      let kept = 0;
      let used = 0;
      for (const row of r.rows) {
        const sz = row.reduce((s, v) => s + (v == null ? 0 : Buffer.byteLength(v)), 0);
        if (used + sz > budget && kept > 0) break;
        used += sz;
        kept++;
      }
      if (kept < r.rows.length) {
        r.rows = r.rows.slice(0, kept);
        r.truncated = { kept, total: r.rowCount ?? r.truncated?.total ?? null };
      }
      bytes += used;
    }
    results.push(r);
    onStatement?.(r);
    if (r.error && errors === "stop") break;
  }
  return { results, txn: await txnStatusSettled(client) };
}
