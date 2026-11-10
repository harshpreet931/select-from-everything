// datasets/<name>/{dataset.json, schema.sql, data.sql, setup/<name>.sql}: reading, hashing and
// seeding them with PGlite in node. used by sql-assets (builds public/sql/datasets/*.json and
// src/lib/sql/datasets.gen.json) and sql-check (same snapshots the browser builds).
// seeding goes through public/sql/engine.js, the exact code the browser worker runs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { splitSql } from "../../src/lib/sql/shared/split.mjs";
import { EXTENSIONS } from "../../src/lib/sql/shared/support.mjs";
import { fnv64 } from "../../src/lib/sql/shared/hash.mjs";
import * as engine from "../../public/sql/engine.js";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const datasetsDir = path.join(root, "datasets");
export const pgliteDir = path.join(root, "node_modules/@electric-sql/pglite");

/** the order datasets are listed in (pickers, docs). anything else comes after, by name */
const ORDER = ["empty", "shop", "school", "bank", "org", "events", "lab"];

export function pgliteVersion() {
  return JSON.parse(fs.readFileSync(path.join(pgliteDir, "package.json"), "utf8")).version;
}

/** the pins in src/lib/site.ts: pg: { version: "18.6", pglite: "0.5.12", engine: "..." } */
export function sitePin() {
  const src = fs.readFileSync(path.join(root, "src/lib/site.ts"), "utf8");
  const pg = /\bpg:\s*\{([^}]*)\}/.exec(src)?.[1] ?? "";
  return {
    pglite: /pglite:\s*"([^"]+)"/.exec(pg)?.[1] ?? null,
    version: /version:\s*"([^"]+)"/.exec(pg)?.[1] ?? null,
    engine: /engine:\s*"([^"]+)"/.exec(pg)?.[1] ?? null,
  };
}

export function listDatasets() {
  const names = fs
    .readdirSync(datasetsDir)
    .filter((n) => fs.existsSync(path.join(datasetsDir, n, "dataset.json")));
  return names.sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}

const statementsOf = (file) => splitSql(fs.readFileSync(file, "utf8")).map((s) => s.sql);

/**
 * @param {string} name
 * @returns {{ name: string; title: string; blurb: string; analyze: boolean; extensions: string[];
 *   maxRowsPerTable: number; statements: string[]; setups: Record<string, string[]>; files: string[] }}
 */
export function readDataset(name) {
  const dir = path.join(datasetsDir, name);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "dataset.json"), "utf8"));
  if (meta.name !== name) throw new Error(`datasets/${name}/dataset.json: name is "${meta.name}"`);
  for (const e of meta.extensions ?? []) {
    if (!EXTENSIONS.includes(e)) throw new Error(`datasets/${name}: extension ${e} isn't shipped to the browser`);
  }
  const statements = (meta.files ?? []).flatMap((f) => statementsOf(path.join(dir, f)));
  const setups = Object.fromEntries((meta.setups ?? []).map((s) => [s, statementsOf(path.join(dir, "setup", `${s}.sql`))]));
  return {
    name,
    title: meta.title ?? name,
    blurb: meta.blurb ?? "",
    analyze: !!meta.analyze,
    extensions: meta.extensions ?? [],
    maxRowsPerTable: meta.maxRowsPerTable ?? 30000,
    statements,
    setups,
    files: [...(meta.files ?? []), ...(meta.setups ?? []).map((s) => `setup/${s}.sql`)],
  };
}

/** changes whenever anything that affects the built database changes */
export function datasetHash(ds, pglite = pgliteVersion()) {
  return fnv64(
    JSON.stringify({ pglite, statements: ds.statements, setups: ds.setups, analyze: ds.analyze, extensions: ds.extensions }),
  );
}

/** what the browser fetches: public/sql/datasets/<name>.<hash>.json */
export function datasetPayload(ds, hash, fingerprint) {
  return {
    name: ds.name,
    hash,
    statements: ds.statements,
    setups: ds.setups,
    analyze: ds.analyze,
    extensions: ds.extensions,
    fingerprint,
  };
}

/* ---- PGlite in node ---------------------------------------------------------------- */

let nodeEngine = null;

/** PGlite from node_modules with its wasm compiled once and the shipped extension bundles */
export async function loadNodeEngine() {
  if (nodeEngine) return nodeEngine;
  const dist = path.join(pgliteDir, "dist");
  const mod = await import(pathToFileURL(path.join(dist, "index.js")).href);
  const [pglite, initdb] = await Promise.all([
    WebAssembly.compile(fs.readFileSync(path.join(dist, "pglite.wasm"))),
    WebAssembly.compile(fs.readFileSync(path.join(dist, "initdb.wasm"))),
  ]);
  const extensions = Object.fromEntries(EXTENSIONS.map((e) => [e, pathToFileURL(path.join(dist, `${e}.tar.gz`))]));
  nodeEngine = { PGlite: mod.PGlite, protocol: mod.protocol, modules: { pglite, initdb }, extensions, engine };
  return nodeEngine;
}

/** open a fresh copy of a snapshot */
export async function openSnapshot(snapshot) {
  const e = await loadNodeEngine();
  return engine.openDb(e.PGlite, { snapshot, extensions: e.extensions, modules: e.modules });
}

/**
 * seed a dataset the way the browser does, then check it: row limits, the catalogue for the
 * schema browser, and every setup applied to a copy.
 */
export async function seedAndInspect(ds) {
  const e = await loadNodeEngine();
  const seeded = await engine.seedDataset(e.PGlite, e.protocol, ds, { extensions: e.extensions, modules: e.modules });
  const db = await openSnapshot(seeded.snapshot);
  const problems = [];
  let tables;
  try {
    tables = await engine.readSchema(db, e.protocol);
    for (const t of tables) {
      if (t.kind !== "table") continue;
      const { results } = await engine.runStatements(db, e.protocol, [{ sql: `SELECT count(*) FROM "${t.name}"`, offset: 0 }]);
      t.rows = Number(results[0].rows[0][0]);
      if (t.rows > ds.maxRowsPerTable) problems.push(`table ${t.name} has ${t.rows} rows, more than ${ds.maxRowsPerTable}`);
    }
  } finally {
    await db.close();
  }
  for (const [name, statements] of Object.entries(ds.setups)) {
    const copy = await openSnapshot(seeded.snapshot);
    try {
      const r = await engine.runSetup(copy, e.protocol, { setup: [{ name, statements }] });
      if (r.setupError) problems.push(`setup ${name}: ${r.setupError.message}\n  in: ${r.setupError.sql.slice(0, 200)}`);
    } finally {
      await copy.close();
    }
  }
  return { ...seeded, tables, problems };
}
