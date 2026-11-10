// select * from everything: the sql engine glue, shared word for word by the browser worker
// (public/sql/sql.worker.js) and the node scripts (sql-assets, sql-check). pure esm: no dom,
// no node imports. the PGlite class and its protocol module are passed in, so the browser
// can load them from /sql/pglite/<version>/ and node from node_modules.
//
// every statement goes through execProtocolRawStream with its own protocol Parser, one
// statement at a time, like psql. (a multi-statement string would be one implicit
// transaction, and execProtocol stops returning messages once the raw stream was used.)

/** read after the snapshot is dumped, on the seeding instance: identical everywhere or something drifted */
export const FINGERPRINT_SQL =
  "SELECT pg_current_snapshot()::text, pg_current_wal_insert_lsn()::text, (SELECT max(oid) FROM pg_class)::text, version()";

/** type names as the result grid shows them: typname, and elem[] for arrays */
const TYPES_SQL =
  "SELECT t.oid::int8::text, CASE WHEN t.typcategory = 'A' AND t.typelem <> 0 THEN e.typname || '[]' ELSE t.typname END FROM pg_type t LEFT JOIN pg_type e ON e.oid = t.typelem";

/** tables, columns, keys of the public schema, for the schema browser and editor completion */
const SCHEMA_SQL = `SELECT c.relname, c.reltuples::int8::text, a.attnum::text, a.attname,
  CASE WHEN t.typcategory = 'A' AND t.typelem <> 0 THEN e.typname || '[]' ELSE t.typname END,
  a.attnotnull::text,
  EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p' AND a.attnum = ANY (k.conkey))::text,
  (SELECT f.relname || '.' || fa.attname FROM pg_constraint k JOIN pg_class f ON f.oid = k.confrelid
     JOIN pg_attribute fa ON fa.attrelid = k.confrelid AND fa.attnum = k.confkey[array_position(k.conkey, a.attnum)]
   WHERE k.conrelid = c.oid AND k.contype = 'f' AND a.attnum = ANY (k.conkey) LIMIT 1),
  c.relkind::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_type t ON t.oid = a.atttypid LEFT JOIN pg_type e ON e.oid = t.typelem
WHERE c.relkind IN ('r', 'p', 'v', 'm')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
ORDER BY c.relname, a.attnum`;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * a PGlite instance: a fresh initdb, or a copy of a snapshot (a dumpDataDir tarball).
 * @param {any} PGlite
 * @param {{ snapshot?: Blob; extensions?: Record<string, URL>; modules?: { pglite?: WebAssembly.Module; initdb?: WebAssembly.Module }; fsBundle?: Blob }} o
 */
export async function openDb(PGlite, o = {}) {
  /** @type {Record<string, unknown>} */
  const opts = {};
  if (o.snapshot) opts.loadDataDir = o.snapshot;
  if (o.extensions) opts.extensions = o.extensions;
  if (o.modules?.pglite) opts.pgliteWasmModule = o.modules.pglite;
  if (o.modules?.initdb) opts.initdbWasmModule = o.modules.initdb;
  if (o.fsBundle) opts.fsBundle = o.fsBundle;
  return PGlite.create(opts);
}

const toError = (m) => {
  /** @type {Record<string, unknown>} */
  const e = { severity: m.severity ?? "ERROR", sqlstate: m.code ?? "", message: m.message ?? "" };
  for (const k of ["detail", "hint", "where", "internalQuery", "schema", "table", "column", "constraint", "dataType"]) {
    if (m[k]) e[k] = m[k];
  }
  if (m.position) e.position = Number(m.position);
  if (m.internalPosition) e.internalPosition = Number(m.internalPosition);
  return e;
};

const toNotice = (m) => {
  /** @type {Record<string, unknown>} */
  const n = { severity: m.severity ?? "NOTICE", sqlstate: m.code ?? "", message: m.message ?? "" };
  for (const k of ["detail", "hint", "where"]) if (m[k]) n[k] = m[k];
  return n;
};

const ROWS_TAG = /^(?:SELECT|INSERT \d+|UPDATE|DELETE|MERGE|COPY|FETCH|MOVE) (\d+)$/;

/**
 * run statements one by one, the way psql does.
 * @param {any} db a PGlite instance
 * @param {any} protocol PGlite's protocol module (Parser, serialize)
 * @param {{ sql: string; offset: number }[]} stmts
 * @param {{
 *   maxRows?: number; maxBytes?: number; maxValue?: number; errors?: "stop" | "continue";
 *   types?: Record<string, string>; onStart?: (i: number) => void; onStatement?: (r: any) => void
 * }} [o]
 * @returns {Promise<{ results: any[]; txn: "I" | "T" | "E"; unknownTypes: Set<number> }>}
 */
export async function runStatements(db, protocol, stmts, o = {}) {
  const maxRows = o.maxRows ?? 1000;
  const maxBytes = o.maxBytes ?? 2_000_000;
  const maxValue = o.maxValue ?? 10_000;
  const types = o.types ?? {};
  const results = [];
  const unknownTypes = new Set();
  /** @type {"I" | "T" | "E"} */
  let txn = "I";
  let bytes = 0;

  for (let i = 0; i < stmts.length; i++) {
    const { sql, offset } = stmts[i];
    o.onStart?.(i);
    /** @type {any} */
    const r = { i, sql, offset, command: "", tag: "", rowCount: null, columns: null, rows: [], notices: [], ms: 0 };
    let dropped = 0;
    let copy = null;
    let copyFull = false;
    const dec = new TextDecoder();
    const parser = new protocol.Parser();
    const t0 = now();
    const onMsg = (m) => {
      switch (m.name) {
        case "rowDescription":
          r.columns = m.fields.map((f) => {
            const type = types[f.dataTypeID];
            if (!type) unknownTypes.add(f.dataTypeID);
            return { name: f.name, type: type ?? `oid ${f.dataTypeID}`, oid: f.dataTypeID, typmod: f.dataTypeModifier };
          });
          break;
        case "dataRow": {
          if (r.rows.length >= maxRows || bytes >= maxBytes) {
            dropped++;
            break;
          }
          const row = m.fields.map((v) => {
            if (v === null) return null;
            bytes += v.length;
            return v.length > maxValue ? `${v.slice(0, maxValue)} …(${v.length.toLocaleString("en-US")} chars)` : v;
          });
          r.rows.push(row);
          break;
        }
        case "commandComplete":
          r.tag = m.text;
          break;
        case "notice":
          r.notices.push(toNotice(m));
          break;
        case "error":
          r.error = toError(m);
          break;
        case "readyForQuery":
          txn = m.status;
          break;
        case "copyOutResponse":
          copy = "";
          break;
        case "copyData":
          if (copy !== null && !copyFull) {
            copy += dec.decode(m.chunk, { stream: true });
            bytes += m.chunk.length;
            if (bytes >= maxBytes) copyFull = true;
          }
          break;
        default:
          break;
      }
    };
    await db.execProtocolRawStream(protocol.serialize.query(sql), { onRawData: (chunk) => parser.parse(chunk, onMsg) });
    r.ms = Math.round((now() - t0) * 10) / 10;
    if (r.error) {
      // like psql: rows that arrived before the error aren't shown
      r.rows = [];
      r.columns = null;
      r.tag = "";
      r.command = "ERROR";
    } else {
      r.command = r.tag.replace(/(?: \d+)+$/, "");
      const n = ROWS_TAG.exec(r.tag);
      if (n) r.rowCount = Number(n[1]);
      if (dropped > 0) r.truncated = { kept: r.rows.length, total: r.rowCount ?? r.rows.length + dropped };
      if (copy !== null) {
        r.copyOut = copy;
        if (copyFull) r.truncated = { kept: 0, total: r.rowCount };
      }
    }
    results.push(r);
    o.onStatement?.(r);
    if (r.error && (o.errors ?? "stop") === "stop") break;
  }
  return { results, txn, unknownTypes };
}

/** rows of one internal query (on an instance the reader never sees, or after their statements) */
async function rowsOf(db, protocol, sql) {
  const { results } = await runStatements(db, protocol, [{ sql, offset: 0 }], { maxRows: 100_000, maxBytes: 64_000_000 });
  const r = results[0];
  if (r.error) throw new Error(`${r.error.message} (in: ${sql.slice(0, 80)})`);
  return r.rows;
}

/** names for type oids the static map didn't have (types created by the reader). run it after their last statement. */
export async function resolveTypes(db, protocol, oids) {
  if (!oids.length) return {};
  const list = oids.filter((x) => Number.isInteger(x)).join(",");
  const rows = await rowsOf(db, protocol, `${TYPES_SQL} WHERE t.oid IN (${list})`);
  return Object.fromEntries(rows.map(([oid, name]) => [oid, name]));
}

/** the public schema: tables with their columns, primary keys and foreign keys */
export async function readSchema(db, protocol) {
  const rows = await rowsOf(db, protocol, SCHEMA_SQL);
  /** @type {Map<string, any>} */
  const tables = new Map();
  for (const [rel, reltuples, , col, type, notNull, pk, fk, kind] of rows) {
    let t = tables.get(rel);
    if (!t) {
      t = { name: rel, kind: kind === "v" ? "view" : kind === "m" ? "matview" : "table", rows: Number(reltuples) >= 0 ? Number(reltuples) : null, columns: [] };
      tables.set(rel, t);
    }
    /** @type {Record<string, unknown>} */
    const c = { name: col, type };
    if (notNull === "true") c.notNull = true;
    if (pk === "true") c.pk = true;
    if (fk) c.fk = fk;
    t.columns.push(c);
  }
  return [...tables.values()];
}

/** CREATE EXTENSION for an ext= flag. IF NOT EXISTS: the lab dataset already has them */
export const extSql = (name) => `CREATE EXTENSION IF NOT EXISTS ${name};`;

/**
 * everything before the reader's statements: extensions, dataset setups, earlier blocks of a session.
 * setup failures are the book's fault (setupError); prelude errors are the reader's own sql.
 * @param {{ ext?: string[]; setup?: { name: string; statements: string[] }[]; prelude?: { stmts: { sql: string; offset: number }[]; errors?: "stop" | "continue" }[] }} o
 */
export async function runSetup(db, protocol, o) {
  const fixed = [...(o.ext ?? []).map(extSql), ...(o.setup ?? []).flatMap((s) => s.statements)];
  for (const sql of fixed) {
    const { results } = await runStatements(db, protocol, [{ sql, offset: 0 }], { maxRows: 0 });
    const e = results[0]?.error;
    if (e) return { setupError: { ...e, sql } };
  }
  for (const p of o.prelude ?? []) {
    await runStatements(db, protocol, p.stmts, { maxRows: 0, errors: p.errors ?? "stop" });
  }
  return {};
}

/**
 * build a dataset: fresh initdb → its statements in one transaction → VACUUM (ANALYZE) when
 * asked → CHECKPOINT → dump. the fingerprint is read after the dump, on this same instance.
 * @param {any} PGlite
 * @param {any} protocol
 * @param {{ name: string; statements: string[]; extensions?: string[]; analyze?: boolean }} ds
 * @param {{ extensions?: Record<string, URL>; modules?: any; fsBundle?: Blob; compression?: "none" | "gzip"; onPhase?: (p: string) => void }} ctx
 */
export async function seedDataset(PGlite, protocol, ds, ctx = {}) {
  const t0 = now();
  ctx.onPhase?.("initdb");
  const db = await openDb(PGlite, { extensions: ctx.extensions, modules: ctx.modules, fsBundle: ctx.fsBundle });
  try {
    ctx.onPhase?.("seed");
    const exec = async (sql) => {
      const { results } = await runStatements(db, protocol, [{ sql, offset: 0 }], { maxRows: 0 });
      const e = results[0]?.error;
      if (e) throw new Error(`dataset ${ds.name}: ${e.message}${e.detail ? ` (${e.detail})` : ""}\n  in: ${sql.slice(0, 300)}`);
    };
    const body = [...(ds.extensions ?? []).map((e) => `CREATE EXTENSION ${e};`), ...ds.statements];
    if (body.length) {
      await exec("BEGIN;");
      for (const sql of body) await exec(sql);
      await exec("COMMIT;");
    }
    if (ds.analyze) await exec("VACUUM (ANALYZE);");
    await exec("CHECKPOINT;");
    const snapshot = await db.dumpDataDir(ctx.compression ?? "none");
    const [fp] = await rowsOf(db, protocol, FINGERPRINT_SQL);
    const engine = String(fp[3]).split(" on ")[0];
    const fingerprint = fp.slice(0, 3).join(" ");
    const types = Object.fromEntries((await rowsOf(db, protocol, TYPES_SQL)).map(([oid, name]) => [oid, name]));
    return { snapshot, fingerprint, engine, types, ms: Math.round(now() - t0) };
  } finally {
    await db.close().catch(() => {});
  }
}
