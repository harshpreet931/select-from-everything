// PGlite (postgres 18 compiled to wasm) in node, driven at the wire-protocol level so we get
// what psql would show: raw text values, the CommandComplete tag, notices, txn status.
// used by `pgtrace --engine=pglite` and tools/descent/capture.mjs.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const require = createRequire(path.join(ROOT, "package.json"));

/** the inspection extensions every pgtrace instance gets */
export const INSPECT_EXT = ["pageinspect", "pg_buffercache", "pg_visibility", "pg_freespacemap", "pg_walinspect"];

/** the installed PGlite's package.json (its exports map hides package.json from require) */
export function pgliteVersion() {
  let dir = path.dirname(require.resolve("@electric-sql/pglite"));
  while (!fs.existsSync(path.join(dir, "package.json"))) dir = path.dirname(dir);
  return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
}

async function load(spec) {
  return import(pathToFileURL(require.resolve(spec)).href);
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/**
 * a fresh in-memory PGlite with the given contrib extensions loadable (CREATE EXTENSION still
 * has to run). returns helpers that never parse values.
 */
export async function openPglite({ extensions = [...INSPECT_EXT, "amcheck"] } = {}) {
  const { PGlite, protocol } = await load("@electric-sql/pglite");
  const ext = {};
  for (const name of extensions) {
    const mod = await load(`@electric-sql/pglite/contrib/${name}`);
    ext[name] = mod[name];
  }
  return wrapPglite(await PGlite.create({ extensions: ext }), protocol);
}

/** the extension bundle PGlite ships for `name` (dist/<name>.tar.gz), if there is one */
export function bundleUrl(name) {
  let dir = path.dirname(require.resolve("@electric-sql/pglite"));
  while (!fs.existsSync(path.join(dir, "package.json"))) dir = path.dirname(dir);
  const f = path.join(dir, "dist", `${name}.tar.gz`);
  return fs.existsSync(f) ? pathToFileURL(f) : null;
}

/** the helpers below, around an already open PGlite (e.g. one opened from a data-dir snapshot) */
export async function wrapPglite(db, protocol) {
  const pkg = pgliteVersion();
  let txn = "I";

  /** raw messages for one simple query */
  async function messages(sql) {
    const parser = new protocol.Parser();
    const msgs = [];
    await db.execProtocolRawStream(protocol.serialize.query(sql), { onRawData: (c) => parser.parse(c, (m) => msgs.push(m)) });
    return msgs;
  }

  // built-in type names, read before any user statement runs
  const types = new Map();
  for (const m of await messages("SELECT oid::int8::text, typname::text FROM pg_type"))
    if (m.name === "dataRow") types.set(Number(m.fields[0]), m.fields[1]);

  /** one statement → StatementResult (src/lib/sql/types.ts) */
  async function run(sql, { i = 0, offset = 0 } = {}) {
    const t0 = performance.now();
    const msgs = await messages(sql);
    const out = { i, sql, offset, command: "", tag: "", rowCount: null, columns: null, rows: [], notices: [], ms: 0 };
    const copy = [];
    for (const m of msgs) {
      if (m.name === "rowDescription")
        out.columns = m.fields.map((f) => ({ name: f.name, type: types.get(f.dataTypeID) ?? String(f.dataTypeID), oid: f.dataTypeID, typmod: f.dataTypeModifier }));
      else if (m.name === "dataRow") out.rows.push(m.fields);
      else if (m.name === "commandComplete") out.tag = m.text;
      else if (m.name === "copyData") copy.push(Buffer.from(m.chunk).toString("utf8"));
      else if (m.name === "notice")
        out.notices.push(clean({ severity: m.severity, sqlstate: m.code, message: m.message, detail: m.detail, hint: m.hint, where: m.where }));
      else if (m.name === "error")
        out.error = clean({
          severity: m.severity,
          sqlstate: m.code,
          message: m.message,
          detail: m.detail,
          hint: m.hint,
          where: m.where,
          position: m.position ? Number(m.position) : undefined,
          internalPosition: m.internalPosition ? Number(m.internalPosition) : undefined,
          internalQuery: m.internalQuery,
          schema: m.schema,
          table: m.table,
          column: m.column,
          constraint: m.constraint,
          dataType: m.dataType,
        });
      else if (m.name === "readyForQuery") txn = m.status;
    }
    if (out.error) {
      out.rows = [];
      out.columns = null;
    }
    const tm = /^INSERT \d+ (\d+)$/.exec(out.tag) ?? /^(?:SELECT|UPDATE|DELETE|MERGE|FETCH|MOVE|COPY) (\d+)$/.exec(out.tag);
    out.command = out.tag.replace(/ \d+( \d+)?$/, "");
    out.rowCount = tm ? Number(tm[1]) : null;
    if (copy.length) out.copyOut = copy.join("");
    out.ms = Math.round((performance.now() - t0) * 100) / 100;
    return out;
  }

  /** rows of raw text for an internal query; throws on error */
  async function q(sql) {
    const r = await run(sql);
    if (r.error) throw Object.assign(new Error(`${r.error.message}\n  in: ${sql.slice(0, 200)}`), { sqlstate: r.error.sqlstate });
    return r.rows;
  }

  const version = (await q("SHOW server_version"))[0][0];
  return {
    db,
    run,
    q,
    types,
    txn: () => txn,
    version,
    pglite: pkg.version,
    engine: `PostgreSQL ${version} (PGlite ${pkg.version})`,
    close: () => db.close(),
  };
}
