"use client";

import { useState } from "react";
import { Chip, Narration, Well, ring, tint } from "@/components/figures/kit";
import { Source } from "./Source";

// the lab engine next to a real server, one difference at a time. every "here" line was run on
// PGlite 0.5.12 (postgres 18.6): the runnable blocks in postgres-in-your-browser.mdx (goldens),
// or, for what the page refuses to send, scratch probes through the same engine.js in node.
// every "server" line is a real postgres 18.6 (Postgres.app) on the author's machine, or
// the postgres 18 docs where it's a default.

type Item = {
  id: string;
  what: string;
  here: string;
  server: string;
  hereOut: string;
  serverOut: string;
  href: string;
  where: string;
};

const ITEMS: Item[] = [
  {
    id: "sessions",
    what: "connections",
    here: "one",
    server: "one per client, plus helpers",
    hereOut: "SELECT pid, backend_type FROM pg_stat_activity;\n pid |    backend_type\n-----+--------------------\n  42 | standalone backend",
    serverOut: "SELECT backend_type FROM pg_stat_activity;\n background writer\n checkpointer\n client backend\n io worker (× 3)\n logical replication launcher\n walwriter",
    href: "/learn/transactions/lost-updates",
    where: "two sessions racing are recorded on a real server and replayed",
  },
  {
    id: "autovacuum",
    what: "autovacuum",
    here: "switched on, never runs",
    server: "a launcher and workers",
    hereOut: "SHOW autovacuum;             → on\nSHOW max_worker_processes;   → 0",
    serverOut: "a default server starts an autovacuum launcher,\nwhich starts workers as tables fill with dead rows.",
    href: "/learn/mvcc/autovacuum",
    where: "autovacuum, from a real server",
  },
  {
    id: "io",
    what: "disk reads",
    here: "io_method = sync",
    server: "io_method = worker",
    hereOut: "SHOW io_method;   → sync",
    serverOut: "SHOW io_method;   → worker\n(three io worker processes by default)",
    href: "/learn/storage/async-io",
    where: "asynchronous I/O",
  },
  {
    id: "parallel",
    what: "parallel query",
    here: "never",
    server: "2 workers per Gather by default",
    hereOut: "SHOW max_parallel_workers;   → 0",
    serverOut: "the docs: max_parallel_workers_per_gather\ndefaults to 2. EXPLAIN shows a Gather node\nwhen postgres splits a scan across workers.",
    href: "/learn/execution/parallel-query",
    where: "parallel query",
  },
  {
    id: "collation",
    what: "text order",
    here: "byte order (C)",
    server: "often a language order",
    hereOut: "ORDER BY x\n Apple, B, Z, _z, a, apple, b, é",
    serverOut: "ORDER BY x COLLATE \"en-US-x-icu\"\n _z, a, apple, Apple, b, B, é, Z",
    href: "/learn/types/text-and-collation",
    where: "text, varchar and collations",
  },
  {
    id: "timeout",
    what: "statement_timeout",
    here: "never fires",
    server: "cancels the statement",
    hereOut: "SET statement_timeout = '50ms';\nSELECT pg_sleep(0.3);\n→ returns normally, 0.3 s later\n(the page stops the whole engine after 10 s instead)",
    serverOut: "SET statement_timeout = '50ms';\nSELECT pg_sleep(0.3);\nERROR 57014: canceling statement due to\n             statement timeout",
    href: "/learn/optimizer/finding-slow-queries",
    where: "finding slow queries",
  },
  {
    id: "copy",
    what: "COPY ... FROM STDIN",
    here: "not sent",
    server: "works (psql's \\copy uses it)",
    hereOut: "the run button refuses it: there's no client to\nstream the rows. forced through the engine in node,\nthe wasm exits (status 1).",
    serverOut: "\\copy customers FROM 'customers.csv' CSV HEADER\nCOPY 2000",
    href: "/learn/writes/copy-and-bulk-loads",
    where: "COPY and bulk loading",
  },
  {
    id: "ext",
    what: "extensions",
    here: "the six for looking inside, plus pg_trgm, btree_gist and ltree",
    server: "whatever is installed",
    hereOut: "CREATE EXTENSION pg_stat_statements;\nERROR 0A000: extension \"pg_stat_statements\" is not available\nHINT: The extension must first be installed on the\nsystem where PostgreSQL is running.",
    serverOut: "CREATE EXTENSION pg_stat_statements;\nCREATE EXTENSION",
    href: "/learn/optimizer/finding-slow-queries",
    where: "finding slow queries",
  },
  {
    id: "databases",
    what: "other databases",
    here: "can create, can't connect",
    server: "\\c scratch",
    hereOut: "CREATE DATABASE shop2;   → CREATE DATABASE\nSELECT current_database();   → postgres\n(\\c is psql's, and there's only one session)",
    serverOut: "shop=# \\c scratch\nYou are now connected to database \"scratch\" as user \"postgres\".",
    href: "/learn/start/psql",
    where: "psql and a real server",
  },
  {
    id: "config",
    what: "ALTER SYSTEM",
    here: "writes a file nobody reloads",
    server: "pg_reload_conf() applies it",
    hereOut: "ALTER SYSTEM SET work_mem = '8MB';   → ALTER SYSTEM\nSELECT pg_reload_conf();\nWARNING: failed to send signal to postmaster:\n         Operation not permitted\nSHOW work_mem;   → 4MB",
    serverOut: "ALTER SYSTEM SET work_mem = '8MB';   → ALTER SYSTEM\nSELECT pg_reload_conf();   → t\nSHOW work_mem;   → 8MB",
    href: "/learn/optimizer/steering-the-planner",
    where: "steering the planner",
  },
  {
    id: "durable",
    what: "durability",
    here: "none: memory, fsync off",
    server: "COMMIT survives a power cut",
    hereOut: "SHOW fsync;   → off\nreload the page and every change is gone.",
    serverOut: "SHOW fsync;   → on\nCOMMIT returns after the WAL is flushed.",
    href: "/learn/wal/commit-path",
    where: "what COMMIT waits for",
  },
];

export function LabVsServer() {
  const [sel, setSel] = useState("sessions");
  const it = ITEMS.find((x) => x.id === sel)!;
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="the browser engine next to a real postgres server">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 @min-[680px]:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <ul className="grid content-start gap-1" aria-label="differences">
          {ITEMS.map((x) => {
            const on = x.id === sel;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => setSel(x.id)}
                  aria-pressed={on}
                  className="flex w-full items-baseline justify-between gap-3 rounded-xs px-2.5 py-1.5 text-left text-12 transition-[background-color,box-shadow] duration-200 ease-sfe"
                  style={{ background: on ? tint("hot", 9) : undefined, boxShadow: on ? ring("hot", 60) : ring("line") }}
                >
                  <span className="shrink-0" style={{ color: on ? "var(--hot)" : "var(--hi)" }}>
                    {x.what}
                  </span>
                  <span className="min-w-0 truncate text-11 text-faint @min-[680px]:hidden">{x.here}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="grid min-w-0 content-start gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="mute" dashed>
              here: {it.here}
            </Chip>
            <Chip tone="live">server: {it.server}</Chip>
          </div>
          <Well label="this page · PGlite 0.5.12, postgres 18.6" dashed>
            <pre className="overflow-x-auto px-3 py-2.5 text-12 leading-[1.7] whitespace-pre text-ink">{it.hereOut}</pre>
          </Well>
          <Well label="a real server · postgres 18.6">
            <pre className="overflow-x-auto px-3 py-2.5 text-12 leading-[1.7] whitespace-pre text-ink">{it.serverOut}</pre>
          </Well>
          <Narration minLines={1} live>
            where the book shows the real thing:{" "}
            <a className="link" href={it.href}>
              {it.where}
            </a>
            .
          </Narration>
        </div>
      </div>
      <Source>real output: PGlite 0.5.12 (postgres 18.6), and a postgres 18.6 server started for this page</Source>
    </div>
  );
}
