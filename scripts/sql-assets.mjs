#!/usr/bin/env node
// pnpm sql-assets [--check] [--watch] [--seed]
//
// everything the browser runner downloads, generated from node_modules and datasets/:
//   public/sql/pglite/<version>/   PGlite's esm closure (index.js + chunks), pglite.wasm, initdb.wasm,
//                                  pglite.data.gz (gzipped here: hosts don't compress octet-stream),
//                                  the shipped extension bundles, LICENSE. gitignored. the version is
//                                  in the path, so it can be cached forever.
//   public/sql/datasets/<name>.<hash>.json   a dataset's statements, split, plus its fingerprint. gitignored.
//   src/lib/sql/datasets.gen.json  the manifest the site imports: versions, download size, and per dataset
//                                  url, hash, fingerprint, tables and columns. committed.
//
// a dataset whose hash matches the committed manifest isn't re-seeded (its fingerprint is reused), so
// dev and build stay fast. --seed re-seeds everything. --check writes nothing: it fails (exit 1) when the
// manifest is stale or a fresh seed gives a different fingerprint. exit 3 when the pglite pin in
// src/lib/site.ts doesn't match node_modules.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  datasetHash,
  datasetPayload,
  datasetsDir,
  listDatasets,
  pgliteDir,
  pgliteVersion,
  readDataset,
  root,
  seedAndInspect,
  sitePin,
} from "./lib/datasets.mjs";
import { EXTENSIONS } from "../src/lib/sql/shared/support.mjs";

const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check");
const WATCH = args.has("--watch");
const SEED = args.has("--seed");

const publicSql = path.join(root, "public/sql");
const manifestPath = path.join(root, "src/lib/sql/datasets.gen.json");
const rel = (p) => path.relative(root, p);
const log = (s) => console.log(`sql-assets: ${s}`);

/* ---- pins ------------------------------------------------------------------------- */

const version = pgliteVersion();
const pin = sitePin();
if (pin.pglite !== version) {
  console.error(
    `sql-assets: src/lib/site.ts pins pglite "${pin.pglite}" but node_modules has ${version}.\n` +
      `  update the pin (and pg.version / pg.engine), then run pnpm sql-check --update and review the diff.`,
  );
  process.exit(3);
}

/* ---- the PGlite closure ------------------------------------------------------------ */

const dist = path.join(pgliteDir, "dist");
const outDir = path.join(publicSql, "pglite", version);

/** index.js and every chunk it statically imports, transitively. dynamic imports (node fs, opfs) are left out */
function jsClosure() {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(path.join(dist, file), "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) walk(m[1]);
  };
  walk("index.js");
  return [...seen];
}

const gzipSize = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

function copyPglite() {
  // the stamp stays out of public/ (it would be served)
  const stampPath = path.join(root, "node_modules/.cache/sql-assets.json");
  const files = jsClosure();
  const wanted = [
    ...files,
    "pglite.wasm",
    "initdb.wasm",
    "pglite.data.gz",
    ...EXTENSIONS.map((e) => `${e}.tar.gz`),
    "LICENSE",
  ];
  let stamp = null;
  try {
    stamp = JSON.parse(fs.readFileSync(stampPath, "utf8"));
  } catch {}
  const complete = stamp?.version === version && wanted.every((f) => fs.existsSync(path.join(outDir, f)));
  if (complete && JSON.stringify(stamp.files) === JSON.stringify(wanted)) return stamp;
  if (CHECK) return null;

  fs.mkdirSync(outDir, { recursive: true });
  const sizes = {};
  for (const f of files) {
    // drop the sourcemap comment: the maps aren't shipped
    const src = fs.readFileSync(path.join(dist, f), "utf8").replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, "\n");
    fs.writeFileSync(path.join(outDir, f), src);
    sizes[f] = { raw: Buffer.byteLength(src), gz: gzipSize(Buffer.from(src)) };
  }
  for (const f of ["pglite.wasm", "initdb.wasm"]) {
    const buf = fs.readFileSync(path.join(dist, f));
    fs.writeFileSync(path.join(outDir, f), buf);
    sizes[f] = { raw: buf.length, gz: gzipSize(buf) };
  }
  const data = fs.readFileSync(path.join(dist, "pglite.data"));
  const dataGz = zlib.gzipSync(data, { level: 9 });
  fs.writeFileSync(path.join(outDir, "pglite.data.gz"), dataGz);
  sizes["pglite.data.gz"] = { raw: data.length, gz: dataGz.length };
  for (const e of EXTENSIONS) {
    const buf = fs.readFileSync(path.join(dist, `${e}.tar.gz`));
    fs.writeFileSync(path.join(outDir, `${e}.tar.gz`), buf);
    sizes[`${e}.tar.gz`] = { raw: buf.length, gz: buf.length };
  }
  fs.copyFileSync(path.join(pgliteDir, "LICENSE"), path.join(outDir, "LICENSE"));
  // only one version at a time
  for (const d of fs.readdirSync(path.join(publicSql, "pglite"))) {
    if (d !== version) fs.rmSync(path.join(publicSql, "pglite", d), { recursive: true, force: true });
  }
  const download = Object.values(sizes).reduce((a, s) => a + s.gz, 0);
  const next = { version, files: wanted, sizes, download };
  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  fs.writeFileSync(stampPath, JSON.stringify(next, null, 2) + "\n");
  log(`copied PGlite ${version} → ${rel(outDir)} (${(download / 1e6).toFixed(2)} MB over the wire, gzipped)`);
  return next;
}

/* ---- datasets ------------------------------------------------------------------------ */

const readManifest = () => {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
};

const stable = (v) => JSON.stringify(v, null, 2) + "\n";

async function buildDatasets(download) {
  const old = readManifest();
  const names = listDatasets();
  const datasets = {};
  const problems = [];
  let engineName = old?.engine ?? pin.engine;
  for (const name of names) {
    const ds = readDataset(name);
    const hash = datasetHash(ds, version);
    const prev = old?.datasets?.[name];
    let entry;
    if (prev && prev.hash === hash && !SEED && !CHECK) {
      entry = prev;
    } else {
      const t0 = performance.now();
      const seeded = await seedAndInspect(ds);
      problems.push(...seeded.problems.map((p) => `datasets/${name}: ${p}`));
      engineName = seeded.engine;
      if (seeded.engine !== pin.engine) problems.push(`datasets/${name}: the engine says "${seeded.engine}", site.ts pins "${pin.engine}"`);
      const ms = Math.round(performance.now() - t0);
      if (CHECK) {
        if (!prev) problems.push(`datasets/${name}: not in ${rel(manifestPath)}. run pnpm sql-assets`);
        else if (prev.hash !== hash) problems.push(`datasets/${name}: changed since ${rel(manifestPath)} was written. run pnpm sql-assets`);
        else if (prev.fingerprint !== seeded.fingerprint)
          problems.push(`datasets/${name}: seeding gives fingerprint ${seeded.fingerprint}, the manifest says ${prev.fingerprint}`);
        else log(`${name}: ok (${ms} ms)`);
        continue;
      }
      log(`${name}: seeded in ${ms} ms, ${seeded.tables.filter((t) => t.kind === "table").length} tables, fingerprint ${seeded.fingerprint}`);
      entry = {
        url: `datasets/${name}.${hash}.json`,
        hash,
        title: ds.title,
        blurb: ds.blurb,
        bytes: 0,
        fingerprint: seeded.fingerprint,
        analyze: ds.analyze,
        extensions: ds.extensions,
        setups: Object.keys(ds.setups),
        tables: seeded.tables,
      };
    }
    if (CHECK) continue;
    const payload = JSON.stringify(datasetPayload(ds, hash, entry.fingerprint));
    entry = { ...entry, url: `datasets/${name}.${hash}.json`, bytes: Buffer.byteLength(payload) };
    if (entry.bytes > 300_000) problems.push(`datasets/${name}: ${entry.bytes} bytes of sql, over the 300 KB the browser should fetch`);
    const file = path.join(publicSql, entry.url);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== payload) fs.writeFileSync(file, payload);
    datasets[name] = entry;
  }

  if (CHECK) return { problems };

  // stale dataset files from older hashes
  const keep = new Set(Object.values(datasets).map((d) => path.basename(d.url)));
  for (const f of fs.readdirSync(path.join(publicSql, "datasets"))) {
    if (!keep.has(f)) fs.rmSync(path.join(publicSql, "datasets", f));
  }

  const manifest = {
    pg: pin.version,
    pglite: version,
    engine: engineName,
    assets: `pglite/${version}/`,
    extensions: EXTENSIONS,
    download: download ?? old?.download ?? 0,
    datasets,
  };
  const text = stable(manifest);
  if (!old || stable(old) !== text) {
    fs.writeFileSync(manifestPath, text);
    log(`wrote ${rel(manifestPath)}`);
  }
  return { problems };
}

/* ---- run ------------------------------------------------------------------------------ */

async function once() {
  const stamp = copyPglite();
  if (CHECK) {
    const m = readManifest();
    const problems = [];
    if (!m) problems.push(`${rel(manifestPath)} is missing. run pnpm sql-assets`);
    else {
      if (m.pglite !== version) problems.push(`${rel(manifestPath)} was built for pglite ${m.pglite}, node_modules has ${version}`);
      const names = listDatasets();
      for (const n of Object.keys(m.datasets)) if (!names.includes(n)) problems.push(`${rel(manifestPath)} lists ${n}, which has no datasets/${n}/`);
      problems.push(...(await buildDatasets(m.download)).problems);
    }
    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      process.exit(1);
    }
    log("up to date");
    return;
  }
  const { problems } = await buildDatasets(stamp?.download);
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    if (!WATCH) process.exit(1);
  }
}

await once();

if (WATCH) {
  // polling: fs events aren't available everywhere (sandboxes, some network drives)
  log(`watching ${rel(datasetsDir)}`);
  const snapshot = () =>
    listDatasets()
      .flatMap((n) => {
        const dir = path.join(datasetsDir, n);
        const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
        return walk(dir);
      })
      .map((f) => `${f}:${fs.statSync(f).mtimeMs}`)
      .join("|");
  let last = snapshot();
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    const now = snapshot();
    if (now === last) return;
    last = now;
    busy = true;
    try {
      await buildDatasets();
    } catch (e) {
      console.error(`sql-assets: ${e.message}`);
    } finally {
      busy = false;
    }
  }, 1000);
}
