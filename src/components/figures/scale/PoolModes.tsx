"use client";

import { useMemo, useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Chip, FIG_TABLE, Legend, NARR, Narration, Provenance, Row, Words, ring, tint } from "@/components/figures/kit";

// a model of a pooler, not a real pgbouncer: four clients share two server connections, one tick
// per statement. "session" gives a client a connection until it disconnects, "transaction" until
// its transaction ends, "statement" for one statement. server connections remember session state
// (a SET, a PREPARE) across clients, the way real backends do; traces/pool-leaks shows that part
// on a real postgres.

type Mode = "session" | "transaction" | "statement";
type Stmt = { sql: string; set?: string; prepare?: string; needs?: string };
type Txn = { wait: number; stmts: Stmt[] };

const CLIENTS: { name: string; txns: Txn[] }[] = [
  { name: "bob", txns: [{ wait: 0, stmts: [{ sql: "BEGIN" }, { sql: "UPDATE" }, { sql: "COMMIT" }] }, { wait: 1, stmts: [{ sql: "SELECT" }] }] },
  {
    name: "alice",
    txns: [
      { wait: 0, stmts: [{ sql: "SET statement_timeout", set: "timeout 50ms (alice's)" }] },
      { wait: 0, stmts: [{ sql: "PREPARE q", prepare: "q" }] },
      { wait: 4, stmts: [{ sql: "EXECUTE q", needs: "q" }] },
    ],
  },
  { name: "carol", txns: [{ wait: 1, stmts: [{ sql: "SELECT" }] }, { wait: 1, stmts: [{ sql: "BEGIN" }, { sql: "INSERT" }, { sql: "COMMIT" }] }] },
  { name: "dan", txns: [{ wait: 2, stmts: [{ sql: "SELECT" }] }, { wait: 0, stmts: [{ sql: "SELECT" }] }] },
];
const CONNS = 2;
const TICKS = 12;

type Cell = { client: string; sql: string; tone?: "dead" | "hot" | "live"; note?: string } | null;
type Tick = { cells: Cell[]; waiting: string[]; idleHeld: (string | null)[]; events: string[] };

function simulate(mode: Mode): { ticks: Tick[]; served: number; errors: number; leaks: number } {
  type C = { name: string; txns: Txn[]; t: number; s: number; wait: number; conn: number | null; done: boolean; failed: boolean };
  const cs: C[] = CLIENTS.map((c) => ({ ...c, t: 0, s: 0, wait: c.txns[0].wait, conn: null, done: false, failed: false }));
  const state: { set?: string; prepared: Set<string> }[] = Array.from({ length: CONNS }, () => ({ prepared: new Set() }));
  const owner: (string | null)[] = Array(CONNS).fill(null);
  const ticks: Tick[] = [];
  let errors = 0;
  let leaks = 0;
  for (let k = 0; k < TICKS; k++) {
    const cells: Cell[] = Array(CONNS).fill(null);
    const waiting: string[] = [];
    const events: string[] = [];
    for (const c of cs) {
      if (c.done) continue;
      if (c.wait > 0) {
        c.wait--;
        continue;
      }
      const txn = c.txns[c.t];
      const st = txn.stmts[c.s];
      if (mode === "statement" && txn.stmts.length > 1) {
        // pgbouncer's statement mode refuses multi-statement transactions
        events.push(`${c.name}'s BEGIN is refused: statement pooling can't keep a transaction on one connection.`);
        errors++;
        c.t++;
        c.s = 0;
        if (c.t >= c.txns.length) c.done = true;
        else c.wait = c.txns[c.t].wait;
        waiting.push(`${c.name} ✗`);
        continue;
      }
      if (c.conn === null) {
        const free = owner.findIndex((o, i) => o === null && !cells[i]);
        if (free < 0) {
          waiting.push(c.name);
          continue;
        }
        owner[free] = c.name;
        c.conn = free;
      }
      const conn = c.conn;
      const s = state[conn];
      let tone: "dead" | "hot" | "live" | undefined;
      let note: string | undefined;
      if (st.needs && !s.prepared.has(st.needs)) {
        tone = "dead";
        note = `prepared statement "${st.needs}" does not exist`;
        events.push(`${c.name}'s EXECUTE lands on conn${conn + 1}, which never saw her PREPARE: error 26000.`);
        errors++;
      } else if (s.set && !s.set.includes(c.name)) {
        tone = "hot";
        note = `runs with ${s.set}`;
        events.push(`${c.name} runs on conn${conn + 1} with alice's statement_timeout still set.`);
        leaks++;
      }
      if (st.set) s.set = st.set;
      if (st.prepare) s.prepared.add(st.prepare);
      cells[conn] = { client: c.name, sql: st.sql, tone, note };
      c.s++;
      const txnDone = c.s >= txn.stmts.length;
      if (txnDone) {
        c.t++;
        c.s = 0;
        if (c.t >= c.txns.length) c.done = true;
        else c.wait = c.txns[c.t].wait;
      }
      const release = mode === "statement" || (mode === "transaction" && txnDone) || c.done;
      if (release) {
        if (mode === "session" && c.done) {
          events.push(`${c.name} disconnects. the pooler runs DISCARD ALL on conn${conn + 1}, and it's free for the next client.`);
          state[conn] = { prepared: new Set() };
        }
        owner[conn] = null;
        c.conn = null;
      }
    }
    const idleHeld = owner.map((o, i) => (o && !cells[i] ? o : null));
    ticks.push({ cells, waiting, idleHeld, events });
  }
  while (ticks.length > 1) {
    const t = ticks[ticks.length - 1];
    if (t.cells.some(Boolean) || t.waiting.length || t.events.length || t.idleHeld.some(Boolean)) break;
    ticks.pop();
  }
  const served = cs.filter((c) => c.done).length;
  return { ticks, served, errors, leaks };
}

const MODES: Mode[] = ["session", "transaction", "statement"];
const SUMMARY: Record<Mode, string> = {
  session: "a client keeps its connection until it disconnects. everything a session can do works, but two connections serve two clients at a time, and an idle client still holds one.",
  transaction: "a connection goes back to the pool at every COMMIT. four clients share two connections easily, but session state stays behind on the connection: alice's timeout leaks to whoever comes next, and her prepared statement isn't where her next transaction lands.",
  statement: "a connection per statement. the fastest turnover, and transactions with more than one statement are refused outright.",
};

export function PoolModes() {
  const [mode, setMode] = useState<Mode>("transaction");
  const sim = useMemo(() => simulate(mode), [mode]);
  const s = useStepper(sim.ticks.length, { interval: 1100 });
  const cur = sim.ticks[Math.min(s.i, sim.ticks.length - 1)];
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-3 text-12 outline-none grid-cols-[minmax(0,1fr)]">
      <Row k="pool_mode =" w="11ch" last>
        <Words label="pool mode" options={MODES} value={mode} onChange={(m) => { setMode(m); s.reset(); }} />
      </Row>
      <div className="min-w-0 overflow-x-auto">
        <table className={`w-full min-w-[300px] border-collapse text-11 @min-[520px]:text-12 ${FIG_TABLE}`}>
          <thead>
            <tr className="text-faint">
              <th className="w-[4ch] py-1 text-left">tick</th>
              {Array.from({ length: CONNS }, (_, i) => (
                <th key={i} className="px-1 py-1 text-left">server conn{i + 1}</th>
              ))}
              <th className="px-1 py-1 text-left">waiting for a connection</th>
            </tr>
          </thead>
          <tbody>
            {sim.ticks.map((t, k) => (
              <tr key={k} className="border-t border-line transition-opacity duration-200 ease-sfe" style={{ opacity: k > s.i ? 0.15 : 1 }}>
                <td className="py-1 tabular" style={{ color: k === s.i ? "var(--hot)" : "var(--faint)" }}>{k + 1}</td>
                {t.cells.map((c, i) => (
                  <td key={i} className="px-1 py-1">
                    {c ? (
                      <span title={c.note} className="inline-flex max-w-full items-center gap-1 truncate rounded-xs px-1.5 leading-[20px]" style={{ boxShadow: ring(c.tone ?? "line-2", c.tone ? 60 : undefined), background: c.tone ? tint(c.tone, 9) : undefined, color: c.tone ? `var(--${c.tone})` : undefined }}>
                        <span className="text-hi">{c.client}</span> {c.sql}
                      </span>
                    ) : t.idleHeld[i] ? (
                      <span className="inline-block rounded-xs px-1.5 leading-[20px] text-mute" style={{ outline: "1px dashed var(--line-2)", outlineOffset: -1 }}>
                        held by {t.idleHeld[i]}, idle
                      </span>
                    ) : (
                      <span className="text-faint">·</span>
                    )}
                  </td>
                ))}
                <td className="px-1 py-1">
                  <span className="flex flex-wrap gap-1">
                    {t.waiting.map((w) => (
                      <Chip key={w} dashed tone={w.endsWith("✗") ? "dead" : "mute"}>{w}</Chip>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Narration tag={`tick ${s.i + 1}`}>{cur.events.length ? cur.events.join(" ") : "nothing unusual this tick: statements run wherever the pool put them."}</Narration>
      <p className={`${NARR} text-mute`}>{SUMMARY[mode]}</p>
      <StepControls s={s} label="tick" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-11 text-faint">
        <span>clients finished: <span className="text-hi">{sim.served}/4</span></span>
        <span>errors: <span style={{ color: sim.errors ? "var(--dead)" : "var(--hi)" }}>{sim.errors}</span></span>
        <span>ran with someone else's setting: <span style={{ color: sim.leaks ? "var(--hot)" : "var(--hi)" }}>{sim.leaks}</span></span>
      </div>
      <Legend items={[["dead", "error"], ["hot", "inherited session state"], ["mute", "idle but held, or waiting", "dashed"]]} />
      <Provenance sim="model of a pooler: 4 clients, 2 server connections, one statement per tick. not pgbouncer output" />
    </div>
  );
}
