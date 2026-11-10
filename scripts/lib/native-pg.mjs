// throwaway native postgres clusters, for pgtrace and `sql-check --engine=native`.
//
// every cluster lives in its own directory under os.tmpdir(), listens on a unix socket in that
// directory only (listen_addresses = ''), and is stopped and deleted when the process exits.
// nothing here ever connects to, signals or reads a server it didn't start: every pg_ctl call
// passes -D <our data dir>, every client passes host = <our socket dir>.
//
//   const pg = findPg();                         // PG_BIN → Postgres.app → /usr/lib/postgresql/18/bin
//   const cluster = await startCluster({ pg, settings: TRACE_SETTINGS });
//   const client = await cluster.connect();      // a `pg` Client on the socket
//   ...
//   await cluster.destroy();
//
// initdb runs once per (binary, flags) and is cached as a template directory in os.tmpdir().
// a new cluster is a copy of that template, so every run starts from byte-identical files:
// same next xid, same next oid, same WAL position.

import { execFile, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import pgPkg from "pg";

const run = promisify(execFile);
const { Client } = pgPkg;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
/** bump to invalidate cached templates when the initdb recipe changes */
const TEMPLATE_RECIPE = 1;

/** the postgres the site is written against, read from src/lib/site.ts */
export function sitePg() {
  const src = fs.readFileSync(path.join(ROOT, "src/lib/site.ts"), "utf8");
  const major = Number(/major:\s*(\d+)/.exec(src)?.[1]);
  const version = /version:\s*"([\d.]+)"/.exec(src)?.[1];
  if (!major || !version) throw new Error("native-pg: can't read pg.major / pg.version from src/lib/site.ts");
  return { major, version };
}

const CANDIDATES = () =>
  [
    process.env.PG_BIN && { dir: process.env.PG_BIN, explicit: true },
    { dir: "/Applications/Postgres.app/Contents/Versions/18/bin" },
    { dir: "/usr/lib/postgresql/18/bin" },
  ].filter(Boolean);

/**
 * find the postgres binaries. throws when nothing matches the site's major version, so a
 * capture can never silently come from postgres 17 or 19.
 * @returns {{ bin: string, version: string, major: number, full: string }}
 */
export function findPg({ major = sitePg().major } = {}) {
  const tried = [];
  for (const { dir, explicit } of CANDIDATES()) {
    const postgres = path.join(dir, "postgres");
    if (!fs.existsSync(postgres)) {
      tried.push(`${dir} (no postgres binary)`);
      if (explicit) break;
      continue;
    }
    const full = execFileSync(postgres, ["--version"], { encoding: "utf8" }).trim();
    const m = /(\d+)\.(\d+)/.exec(full);
    const found = m ? Number(m[1]) : NaN;
    if (found !== major) {
      tried.push(`${dir} (${full}, need ${major})`);
      if (explicit) break;
      continue;
    }
    for (const tool of ["initdb", "pg_ctl", "pg_controldata", "pg_waldump"]) {
      if (!fs.existsSync(path.join(dir, tool))) throw new Error(`native-pg: ${dir} has postgres but no ${tool}`);
    }
    return { bin: dir, version: `${m[1]}.${m[2]}`, major: found, full };
  }
  throw new Error(
    `native-pg: no postgres ${major} found. set PG_BIN to its bin directory.\n  tried: ${tried.join("\n         ") || "nothing"}`,
  );
}

/** settings every native cluster gets. they match the browser engine where it matters for output. */
export const BASE_SETTINGS = {
  TimeZone: "UTC",
  DateStyle: "ISO, MDY",
  extra_float_digits: "1",
  lc_messages: "C",
  jit: "off",
  max_parallel_workers_per_gather: "0",
  autovacuum: "off",
  synchronize_seqscans: "off",
};

/**
 * pgtrace's determinism settings (tools/pgtrace/README.md explains each one). wal_level stays
 * replica and full_page_writes stays on, so WAL looks like a real server's.
 */
export const TRACE_SETTINGS = {
  ...BASE_SETTINGS,
  checkpoint_timeout: "1d",
  max_wal_size: "4GB",
  bgwriter_lru_maxpages: "0",
  wal_writer_delay: "10s",
  deadlock_timeout: "100ms",
  log_checkpoints: "on",
  log_line_prefix: "",
  log_min_messages: "warning",
  log_error_verbosity: "default",
  wal_level: "replica",
  full_page_writes: "on",
};

const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;

async function lock(dir) {
  const lockDir = `${dir}.lock`;
  for (let i = 0; i < 600; i++) {
    try {
      fs.mkdirSync(lockDir);
      return () => fs.rmSync(lockDir, { recursive: true, force: true });
    } catch {
      // a stale lock older than 2 minutes is from a crashed run
      try {
        if (Date.now() - fs.statSync(lockDir).mtimeMs > 120_000) fs.rmSync(lockDir, { recursive: true, force: true });
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`native-pg: timed out waiting for ${lockDir}`);
}

/**
 * the cached initdb output for this binary and these flags.
 * `initdb --no-locale -E UTF8 -U postgres --auth=trust --no-sync --no-data-checksums`
 * (or --data-checksums when asked: checksums are on by default in 18, off here unless a scenario opts in).
 */
export async function template({ pg = findPg(), checksums = false } = {}) {
  const flags = ["--no-locale", "-E", "UTF8", "-U", "postgres", "--auth=trust", "--no-sync", checksums ? "--data-checksums" : "--no-data-checksums"];
  const key = crypto.createHash("sha1").update(JSON.stringify([TEMPLATE_RECIPE, pg.bin, pg.full, flags])).digest("hex").slice(0, 12);
  const dir = path.join(os.tmpdir(), `sfe-pgtpl-${key}`);
  if (fs.existsSync(path.join(dir, ".ok"))) return dir;
  const unlock = await lock(dir);
  try {
    if (fs.existsSync(path.join(dir, ".ok"))) return dir;
    fs.rmSync(dir, { recursive: true, force: true });
    const tmp = `${dir}.tmp-${process.pid}`;
    fs.rmSync(tmp, { recursive: true, force: true });
    await run(path.join(pg.bin, "initdb"), ["-D", tmp, ...flags], { env: cleanEnv() });
    fs.renameSync(tmp, dir);
    fs.writeFileSync(path.join(dir, ".ok"), `${pg.full}\n${flags.join(" ")}\n`);
    return dir;
  } finally {
    unlock();
  }
}

/** the environment for child processes: no PG* variables, so nothing can point at another server */
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("PG")) delete env[k];
  env.LC_ALL = "C";
  env.LANG = "C";
  env.TZ = "UTC";
  return env;
}

const live = new Set();
let hooked = false;
function hookExit() {
  if (hooked) return;
  hooked = true;
  const cleanup = () => {
    for (const c of live) c.destroySync();
  };
  process.on("exit", cleanup);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      cleanup();
      process.exit(130);
    });
  }
}

export class Cluster {
  constructor({ pg, root, settings, checksums }) {
    this.pg = pg;
    this.root = root;
    this.data = path.join(root, "data");
    this.sock = root;
    this.logFile = path.join(root, "server.log");
    this.port = 40000 + Math.floor(Math.random() * 20000);
    this.settings = settings;
    this.checksums = checksums;
    this.running = false;
    this.clients = new Set();
  }

  tool(name) {
    return path.join(this.pg.bin, name);
  }

  async ctl(args) {
    return run(this.tool("pg_ctl"), ["-D", this.data, ...args], { env: cleanEnv() });
  }

  /** start (or restart after a crash). waits until it accepts connections. */
  async start() {
    await this.ctl(["-l", this.logFile, "-w", "-t", "60", "start"]);
    this.running = true;
  }

  /** clean shutdown */
  async stop(mode = "fast") {
    if (!this.running) return;
    await this.closeClients();
    await this.ctl(["-m", mode, "-w", "stop"]);
    this.running = false;
  }

  /**
   * a process crash: `pg_ctl stop -m immediate`. every backend dies without a checkpoint.
   * the OS page cache survives (this is not a power cut), so written-but-unflushed WAL may too.
   */
  async crash() {
    for (const c of this.clients) c.on("error", () => {});
    await this.ctl(["-m", "immediate", "-w", "stop"]);
    this.running = false;
    await this.closeClients();
  }

  async closeClients() {
    const all = [...this.clients];
    this.clients.clear();
    await Promise.all(all.map((c) => c.end().catch(() => {})));
  }

  /** a connected `pg` Client on this cluster's socket. the caller owns it, destroy() ends it. */
  async connect({ database = "postgres", application_name = "native-pg", user = "postgres", ...rest } = {}) {
    const client = new Client({ host: this.sock, port: this.port, user, database, application_name, ...rest });
    client.on("error", () => {}); // a crashed server is not an unhandled error
    await client.connect();
    this.clients.add(client);
    client.once("end", () => this.clients.delete(client));
    return client;
  }

  /** one-off query on a fresh connection, rows as arrays of raw text */
  async query(sql, { database } = {}) {
    const c = await this.connect({ database });
    try {
      return await c.query({ text: sql, rowMode: "array", types: RAW_TYPES });
    } finally {
      await c.end().catch(() => {});
    }
  }

  /** `pg_controldata` as { "Database cluster state": "in production", ... } */
  async controldata() {
    const { stdout } = await run(this.tool("pg_controldata"), ["-D", this.data], { env: cleanEnv() });
    const out = {};
    for (const line of stdout.split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return out;
  }

  /** `pg_waldump -p <data>/pg_wal ...args`. returns stdout; the "invalid record length" at the end of WAL is not an error */
  async waldump(args) {
    try {
      const { stdout } = await run(this.tool("pg_waldump"), ["-p", path.join(this.data, "pg_wal"), ...args], {
        env: cleanEnv(),
        maxBuffer: 64 << 20,
      });
      return stdout;
    } catch (e) {
      if (typeof e.stdout === "string") return e.stdout;
      throw e;
    }
  }

  /** bytes of server log written so far, for logSince() */
  logSize() {
    try {
      return fs.statSync(this.logFile).size;
    } catch {
      return 0;
    }
  }

  /** server log lines written after byte offset `from` */
  logSince(from = 0) {
    let buf;
    try {
      buf = fs.readFileSync(this.logFile);
    } catch {
      return [];
    }
    return buf
      .subarray(from)
      .toString("utf8")
      .split("\n")
      .filter((l) => l.length);
  }

  async destroy() {
    try {
      if (this.running) await this.stop("immediate");
    } catch {}
    fs.rmSync(this.root, { recursive: true, force: true });
    live.delete(this);
  }

  destroySync() {
    try {
      if (this.running) execFileSync(this.tool("pg_ctl"), ["-D", this.data, "-m", "immediate", "-w", "stop"], { stdio: "ignore", env: cleanEnv() });
    } catch {}
    this.running = false;
    fs.rmSync(this.root, { recursive: true, force: true });
    live.delete(this);
  }
}

/**
 * a fresh cluster from the cached template, started.
 * @param {{ pg?: ReturnType<typeof findPg>, settings?: Record<string,string>, checksums?: boolean, keep?: boolean }} opts
 *   settings are written to postgresql.conf, so they survive a crash and restart.
 *   keep: don't delete the directory on exit (debugging); it is printed to stderr.
 */
export async function startCluster({ pg = findPg(), settings = BASE_SETTINGS, checksums = false, keep = false } = {}) {
  const tpl = await template({ pg, checksums });
  // short prefix: the socket path (<root>/.s.PGSQL.<port>) must stay under ~100 bytes
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sfe-"));
  const cluster = new Cluster({ pg, root, settings, checksums });
  if (Buffer.byteLength(path.join(root, `.s.PGSQL.${cluster.port}`)) > 100) {
    fs.rmSync(root, { recursive: true, force: true });
    throw new Error(`native-pg: socket path too long under ${os.tmpdir()}; set TMPDIR to something shorter`);
  }
  try {
    // copy-on-write clone where the filesystem supports it (APFS), plain copy elsewhere
    try {
      await run("cp", [process.platform === "darwin" ? "-cRp" : "-Rp", tpl, cluster.data]);
    } catch {
      await run("cp", ["-Rp", tpl, cluster.data]);
    }
    fs.rmSync(path.join(cluster.data, ".ok"), { force: true });
    fs.chmodSync(cluster.data, 0o700);
    const conf = {
      listen_addresses: "",
      unix_socket_directories: cluster.sock,
      port: String(cluster.port),
      ...settings,
    };
    fs.appendFileSync(
      path.join(cluster.data, "postgresql.conf"),
      `\n# native-pg (scripts/lib/native-pg.mjs)\n${Object.entries(conf)
        .map(([k, v]) => `${k} = ${quote(v)}`)
        .join("\n")}\n`,
    );
    if (!keep) {
      live.add(cluster);
      hookExit();
    } else {
      process.stderr.write(`native-pg: keeping ${root}\n`);
    }
    await cluster.start();
    return cluster;
  } catch (e) {
    let log = "";
    try {
      log = fs.readFileSync(cluster.logFile, "utf8").split("\n").slice(-15).join("\n");
    } catch {}
    cluster.destroySync();
    throw new Error(`native-pg: cluster failed to start: ${e.message}${log ? `\n${log}` : ""}`);
  }
}

/** node-pg type config that keeps every value as the server's text (never parsed) */
export const RAW_TYPES = { getTypeParser: () => (v) => v };

/** "0/1549A28" → 22321704 (asserts it fits a js number exactly) */
export function lsnToNumber(s) {
  if (s == null) return null;
  const m = /^([0-9A-Fa-f]+)\/([0-9A-Fa-f]+)$/.exec(String(s).trim());
  if (!m) throw new Error(`not an LSN: ${s}`);
  const n = parseInt(m[1], 16) * 2 ** 32 + parseInt(m[2], 16);
  if (n >= 2 ** 53) throw new Error(`LSN ${s} doesn't fit in 53 bits`);
  return n;
}

/** 22321704 → "0/1549A28" */
export function numberToLsn(n) {
  const hi = Math.floor(n / 2 ** 32);
  const lo = n % 2 ** 32;
  return `${hi.toString(16).toUpperCase()}/${lo.toString(16).toUpperCase()}`;
}
