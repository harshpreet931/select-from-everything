#!/usr/bin/env node
// pgtrace: run a scenario on a real postgres and write down what the server looked like
// after every step. tools/pgtrace/README.md has the scenario format and every probe.
//
//   pnpm pgtrace content/mvcc/traces/update-twice.scenario.sql     → update-twice.pgtrace.json
//   pnpm pgtrace content/transactions                               every scenario under a folder
//   pnpm pgtrace                                                    every scenario in content/
//   --check            re-run and compare with the committed json (volatile parts ignored), write nothing
//   --twice            run twice, fail if the two runs differ (undeclared nondeterminism)
//   --engine=pglite    run on PGlite in node instead of a native server (one session only)
//   --keep             keep the throwaway cluster directory (printed), for poking at it
//   --quiet            only print problems
//
// exit codes: 0 fine, 1 a scenario failed or differs, 2 usage, 3 no usable postgres.

import fs from "node:fs";
import path from "node:path";
import { parseScenario } from "./lib/scenario.mjs";
import { ROOT, ScenarioError, runScenario } from "./lib/run.mjs";
import { diffPaths, masked, short, stringify } from "./lib/json.mjs";

const SIZE_WARN = 60 * 1024;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const engineArg = args.find((a) => a.startsWith("--engine="))?.slice(9);
const paths = args.filter((a) => !a.startsWith("--"));
for (const f of flags) {
  if (!["--check", "--twice", "--keep", "--quiet"].includes(f) && !f.startsWith("--engine=")) {
    console.error(`pgtrace: unknown flag ${f}`);
    process.exit(2);
  }
}
if (engineArg && !["native", "pglite"].includes(engineArg)) {
  console.error("pgtrace: --engine is native or pglite");
  process.exit(2);
}
const quiet = flags.has("--quiet");
const say = (s) => quiet || console.log(s);

function find(p) {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    console.error(`pgtrace: ${p} doesn't exist`);
    process.exit(2);
  }
  if (fs.statSync(abs).isFile()) return [abs];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".scenario.sql")) out.push(f);
    }
  };
  walk(abs);
  return out.sort();
}

const files = (paths.length ? paths : [path.join(ROOT, "content")]).flatMap(find);
if (!files.length) {
  say("pgtrace: no .scenario.sql files");
  process.exit(0);
}

// PGlite in node can stall with the event loop empty: the main thread parks in V8's
// NodePlatform::DrainTasks at 0% CPU while a wasm promise never settles (seen in pgtrace and
// sql-check on node 23.10). a live interval keeps the loop turning while a scenario runs, and a
// watchdog turns a real stall into an error instead of a silent hang. PGTRACE_STALL_MS to tune.
const STALL_MS = Number(process.env.PGTRACE_STALL_MS ?? 180_000);
async function guarded(run, rel) {
  const tick = setInterval(() => {}, 1000);
  let timer;
  try {
    return await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no progress for ${STALL_MS / 1000} s, the engine stalled. run it again (${rel})`)), STALL_MS);
      }),
    ]);
  } finally {
    clearInterval(tick);
    clearTimeout(timer);
  }
}

let failed = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const out = file.replace(/\.scenario\.sql$/, ".pgtrace.json");
  const t0 = performance.now();
  try {
    const sc = parseScenario(fs.readFileSync(file, "utf8"), rel);
    const opts = { engine: engineArg, keep: flags.has("--keep"), log: quiet ? () => {} : (s) => process.env.PGTRACE_VERBOSE && console.log(s) };
    const { trace, warnings } = await guarded(() => runScenario(sc, opts), rel);
    for (const w of warnings) console.warn(`  ! ${rel}: ${w}`);

    if (flags.has("--twice")) {
      const again = await guarded(() => runScenario(sc, opts), rel);
      const d = diffPaths(masked(trace), masked(again.trace));
      if (d.length) {
        failed++;
        console.error(`✗ ${rel}: two runs differ (nondeterminism the scenario doesn't control)`);
        for (const x of d) console.error(`    ${x.path}: ${short(x.a)} → ${short(x.b)}`);
        continue;
      }
    }

    const text = `${stringify(trace)}\n`;
    const size = Buffer.byteLength(JSON.stringify(trace));
    const ms = Math.round(performance.now() - t0);
    const info = `${trace.steps.length} steps, ${(size / 1024).toFixed(1)} KB, ${ms} ms${flags.has("--twice") ? ", same twice" : ""}`;
    if (size > SIZE_WARN) console.warn(`  ! ${rel}: ${(size / 1024).toFixed(1)} KB is over the 60 KB budget (it ships in the page). trim probes or block ranges.`);

    if (flags.has("--check")) {
      if (!fs.existsSync(out)) {
        failed++;
        console.error(`✗ ${rel}: no ${path.basename(out)} yet. run: pnpm pgtrace ${rel}`);
        continue;
      }
      const old = JSON.parse(fs.readFileSync(out, "utf8"));
      const d = diffPaths(masked(old), masked(trace));
      if (d.length) {
        failed++;
        console.error(`✗ ${rel}: differs from ${path.basename(out)}`);
        for (const x of d) console.error(`    ${x.path}: ${short(x.a)} → ${short(x.b)}`);
        continue;
      }
      say(`✓ ${rel} (${info})`);
    } else {
      const prev = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;
      if (prev !== text) fs.writeFileSync(out, text);
      say(`${prev === text ? "=" : "✓"} ${path.relative(ROOT, out)} (${info}${prev === text ? ", unchanged" : ""})`);
    }
  } catch (e) {
    failed++;
    const msg = e.message.startsWith(rel) ? e.message : `${rel}: ${e.message}`;
    if (e instanceof ScenarioError || /^native-pg:/.test(e.message) || e.message.startsWith(rel)) console.error(`✗ ${msg}`);
    else console.error(`✗ ${rel}: ${e.stack}`);
    if (/^native-pg: no postgres/.test(e.message)) process.exit(3);
  }
}
process.exit(failed ? 1 : 0);
