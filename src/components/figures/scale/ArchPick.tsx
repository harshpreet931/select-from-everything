"use client";

import { useState } from "react";
import { NARR, Provenance, Row, Words, ring } from "@/components/figures/kit";

// where each system splits the work, drawn by hand from the cited papers and docs. four layers,
// top to bottom; a layer marked "split" is spread over many machines, "one" runs on a single
// node at a time, "shared" is one service everyone uses.

type Layer = { k: string; how: "one" | "split" | "shared"; text: string };
type Sys = { layers: Layer[]; note: string; src: string };

const SYS: Record<string, Sys> = {
  postgres: {
    layers: [
      { k: "SQL", how: "one", text: "one server parses, plans and executes" },
      { k: "transactions", how: "one", text: "MVCC and locks in one shared memory" },
      { k: "replication", how: "one", text: "WAL streamed to standbys that only read" },
      { k: "storage", how: "one", text: "local files, 8 KB pages" },
    ],
    note: "the baseline: everything on one machine, standbys as copies. simple and strictly serializable at SERIALIZABLE, and every write goes through one box.",
    src: "the postgres manual",
  },
  citus: {
    layers: [
      { k: "SQL", how: "one", text: "a coordinator plans, and pushes fragments to workers" },
      { k: "transactions", how: "split", text: "each worker is a postgres; multi-node writes use 2PC" },
      { k: "replication", how: "split", text: "each node replicated like plain postgres" },
      { k: "storage", how: "split", text: "shards are ordinary postgres tables on workers" },
    ],
    note: "postgres sharded from the inside, as an extension: distributed tables by a distribution column, reference tables copied to every worker, aggregates pushed down to workers.",
    src: "citus docs",
  },
  spanner: {
    layers: [
      { k: "SQL", how: "split", text: "any server can coordinate a query" },
      { k: "transactions", how: "split", text: "2PC across groups; TrueTime timestamps and commit wait" },
      { k: "replication", how: "split", text: "each split of the keyspace is a Paxos group" },
      { k: "storage", how: "split", text: "tablets on a distributed file system" },
    ],
    note: "every piece of data is replicated by its own Paxos group, transactions span groups with 2PC, and synchronized clocks with a known error bound give an order that matches real time.",
    src: "Corbett et al., OSDI 2012",
  },
  CockroachDB: {
    layers: [
      { k: "SQL", how: "split", text: "every node speaks the postgres wire protocol" },
      { k: "transactions", how: "split", text: "serializable by default; hybrid logical clocks" },
      { k: "replication", how: "split", text: "the keyspace in ranges, each a raft group" },
      { k: "storage", how: "split", text: "a key-value store on each node" },
    ],
    note: "spanner's shape without atomic clocks: ranges replicated by raft, and clock uncertainty handled by a configured maximum offset and retries instead of commit wait.",
    src: "cockroachdb docs",
  },
  YugabyteDB: {
    layers: [
      { k: "SQL", how: "split", text: "YSQL reuses postgres's query layer code" },
      { k: "transactions", how: "split", text: "distributed transactions in DocDB" },
      { k: "replication", how: "split", text: "tables in tablets, each a raft group" },
      { k: "storage", how: "split", text: "DocDB, built on RocksDB" },
    ],
    note: "postgres's parser, planner and executor on top, a raft-replicated document store underneath: postgres-compatible syntax with a different engine below.",
    src: "yugabytedb docs",
  },
  aurora: {
    layers: [
      { k: "SQL", how: "one", text: "one writer instance, plus read replicas" },
      { k: "transactions", how: "one", text: "on the writer" },
      { k: "replication", how: "shared", text: "the writer ships only log records to storage" },
      { k: "storage", how: "shared", text: "6 copies over 3 zones, write quorum 4, read quorum 3" },
    ],
    note: "the log is the database: the engine sends redo records to a distributed storage service, which builds pages itself. replicas read the same storage, so they don't replay a copy of their own.",
    src: "Verbitski et al., SIGMOD 2017",
  },
  neon: {
    layers: [
      { k: "SQL", how: "one", text: "postgres, with a patched storage layer, as stateless compute" },
      { k: "transactions", how: "one", text: "inside that postgres" },
      { k: "replication", how: "shared", text: "WAL to safekeepers, which agree with Paxos" },
      { k: "storage", how: "shared", text: "pageservers rebuild pages from WAL; data in object storage" },
    ],
    note: "postgres with its disk taken away: compute can stop, start and branch, because the WAL and the pages live in a separate, replicated storage service.",
    src: "neon docs",
  },
};

const HOW: Record<Layer["how"], { label: string; glyph: string; edge: "line-2" | "hi" | "mute" }> = {
  one: { label: "one node", glyph: "▢", edge: "line-2" },
  split: { label: "split across nodes", glyph: "▢▢▢", edge: "hi" },
  shared: { label: "a shared service", glyph: "◫", edge: "mute" },
};

export function ArchPick() {
  const [pick, setPick] = useState("spanner");
  const s = SYS[pick];
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="system =" w="9ch" last>
        <Words label="system" options={Object.keys(SYS)} value={pick} onChange={setPick} />
      </Row>
      <div className="grid gap-1.5">
        {s.layers.map((l) => {
          const h = HOW[l.how];
          return (
            <div key={l.k} className="grid grid-cols-[12ch_minmax(0,1fr)] items-stretch gap-2 @max-[460px]:grid-cols-1">
              <span className="self-center text-mute">{l.k}</span>
              <div className="min-w-0 rounded-md px-2.5 py-1.5" style={{ boxShadow: ring(h.edge, h.edge === "hi" ? 45 : undefined), background: l.how === "one" ? "var(--well)" : "var(--well-2)" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-hi">{l.text}</span>
                  <span className="text-[10.5px] text-faint"><span aria-hidden className="mr-1 text-mute">{h.glyph}</span>{h.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className={NARR} aria-live="polite">{s.note}</p>
      <Provenance drawn={`from ${s.src}, simplified to four layers`} />
    </div>
  );
}
