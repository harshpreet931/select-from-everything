import type { ReactNode } from "react";
import { Figure } from "@/components/mdx/blocks";
import { ThemeFromQuery } from "./ThemeFromQuery";
import { Legend, Provenance, ResultTable, SqlPanel, Chip } from "@/components/figures/kit";
import { ClauseStepper } from "@/components/db/ClauseStepper";
import { SessionLanes } from "@/components/db/SessionLanes";
import { PageView } from "@/components/db/PageView";
import { VersionChain } from "@/components/db/VersionChain";
import { BTree } from "@/components/db/BTree";
import { PlanTree } from "@/components/db/PlanTree";
import { JoinLab } from "@/components/db/JoinLab";
import { BufferPool } from "@/components/db/BufferPool";
import { WalStrip } from "@/components/db/WalStrip";
import { PgStepper } from "@/components/db/PgStepper";
import { HeapFile } from "@/components/db/HeapFile";
import { SnapshotLine } from "@/components/db/SnapshotLine";
import { WaitForGraph } from "@/components/db/WaitForGraph";
import { LockTable } from "@/components/db/LockTable";
import { HashIndex } from "@/components/db/HashIndex";
import heapfile from "@/lib/db/fixtures/heapfile.json";
import { btreeFromPages, fromExplainJson, traceWal } from "@/lib/db/fromTrace";
import { withSim } from "@/lib/db/sim/volcano";
import btree from "@/lib/db/fixtures/btree.json";
import explain from "@/lib/db/fixtures/explain.json";
import joins from "@/lib/db/fixtures/joins.json";
import type { PgTrace } from "@/lib/db/pgtrace";
import type { Page, SessionStep, Snap, XactStatus } from "@/lib/db/views";
import mini from "@/lib/db/fixtures/mini.pgtrace.json";
import stages from "@/lib/db/fixtures/stages.json";
import vis from "@/lib/db/fixtures/visibility.json";
import twice from "@content/mvcc/traces/update-twice.pgtrace.json";

// the dev-only figure gallery: every db primitive with real sample data (the fixtures in
// src/lib/db/fixtures, captured from postgres 18.6). a route only under `next dev` (see
// next.config.mjs: `.dev.tsx` is a page extension in the development phase alone).
// screenshots: /dev/figures?theme=dark

export const metadata = { title: "figure gallery (dev)", robots: { index: false } };

const trace = mini as unknown as PgTrace;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-16">
      <h2 className="mb-2 font-display text-[1.8rem] font-light text-hi">{title}</h2>
      {children}
    </section>
  );
}

const lost: SessionStep[] = [
  { db: { balance: 100 }, note: "two sessions, both about to add to the same balance, at read committed." },
  { ops: ["BEGIN;", "BEGIN;"] },
  { ops: [{ sql: "SELECT balance FROM accounts WHERE id = 1;", out: "100" }, null], note: "T1 reads 100." },
  { ops: [null, { sql: "SELECT balance FROM accounts WHERE id = 1;", out: "100" }], note: "T2 also reads 100. neither has written yet." },
  { ops: [{ sql: "UPDATE accounts SET balance = 110 WHERE id = 1;", out: "UPDATE 1" }, null], note: "T1 writes 100 + 10, computed in the app." },
  {
    ops: [null, { sql: "UPDATE accounts SET balance = 120 WHERE id = 1;", wait: "waits for T1: ShareLock on transaction 754" }],
    note: "T2 wants the same row. T1 holds its row lock until it ends, so T2 waits.",
  },
  { ops: [{ sql: "COMMIT;" }, null], db: { balance: 110 }, note: "T1 commits. the lock is released." },
  { ops: [null, { sql: "UPDATE accounts SET balance = 120 WHERE id = 1;", woke: true, out: "UPDATE 1" }], note: "T2 wakes up and writes its own 100 + 20." },
  { ops: [null, "COMMIT;"], db: { balance: { v: 120, k: "dead" } as unknown as number }, note: "the balance is 120. T1's +10 is gone: a lost update." },
];

const rr: SessionStep[] = [
  ...lost.slice(0, 7),
  {
    ops: [null, { sql: "UPDATE accounts SET balance = 120 WHERE id = 1;", woke: true, error: { sqlstate: "40001", message: "could not serialize access due to concurrent update" } }],
    note: "under repeatable read, T2 wakes up, sees the row changed since its snapshot, and fails.",
  },
  { ops: [null, "ROLLBACK;"], db: { balance: 110 }, note: "T2 rolls back and can retry. the balance is 110: nothing lost." },
];

export default function Gallery() {
  const v = vis as unknown as { snap: Snap; me: number; xact: Record<number, XactStatus>; page: Page };
  const last = trace.steps.length - 1;
  return (
    // inside .prose, like a chapter: figures must hold up against the article's table and heading styles
    <main className="prose mx-auto max-w-[880px] px-[var(--gutter)] pt-[calc(var(--bar-h)+32px)] pb-32">
      <ThemeFromQuery />
      <p className="font-mono text-12 text-faint">dev only · not in the production build</p>
      <h1 className="font-display text-[2.4rem] font-light text-hi">figure gallery</h1>
      <p className="mt-2 text-mute italic">every db primitive, drawn from real postgres 18.6 captures in src/lib/db/fixtures.</p>

      <Section id="kit" title="kit">
        <Figure caption="SqlPanel with a hot clause mark and a dead line; ResultTable with a cursor, a group and a ghost row.">
          <div className="grid gap-4 grid-cols-[minmax(0,1fr)]">
            <SqlPanel code={"SELECT id, name\nFROM users\nWHERE name = '' OR 1=1 --';"} file="login.sql" dead={[3]} marks={[{ line: 3, from: 14, to: 27, tone: "dead" }]} />
            <ResultTable
              columns={[{ name: "ctid", sys: true }, { name: "id", type: "int4" }, { name: "category", type: "text" }, { name: "price", type: "numeric" }]}
              rows={[
                ["(0,1)", 1, "books", "12.50"],
                ["(0,2)", 2, "books", "8.00"],
                ["(0,3)", 3, "games", null],
                ["(0,4)", 4, "toys", ""],
              ]}
              group="category"
              cursor={1}
              ghostRows={[3]}
            />
            <div className="flex flex-wrap gap-2">
              <Chip tone="ref">ref</Chip>
              <Chip tone="live">live</Chip>
              <Chip tone="dead">dead</Chip>
              <Chip tone="meta">meta</Chip>
              <Chip tone="hot">hot</Chip>
              <Chip tone="accent">dirty</Chip>
              <Chip tone="mute" dashed>
                waiting
              </Chip>
            </div>
            <Legend items={[["ref", "points at", "line"], ["live", "visible"], ["dead", "dead", "ghost"], ["meta", "machinery"], ["hot", "look here"], ["accent", "dirty"], ["mute", "waiting", "dashed"]]} />
            <Provenance trace={trace} />
          </div>
        </Figure>
      </Section>

      <Section id="clause" title="ClauseStepper">
        <Figure wide caption="step through the clauses: WHERE strikes rows, GROUP BY buckets alternate, aliases appear at SELECT.">
          <ClauseStepper sql={stages.sql} stages={stages.stages} source="real postgres 18.6 output · fixtures/stages (prefix queries)" />
        </Figure>
      </Section>

      <Section id="lanes" title="SessionLanes">
        <Figure wide caption="pick an isolation level and step: under read committed T1's write is lost, under repeatable read T2 gets 40001.">
          <SessionLanes
            sessions={["T1", "T2"]}
            cells={["balance"]}
            options={[{ key: "iso", label: "isolation", values: ["read committed", "repeatable read"] }]}
            runs={{
              "read committed": { steps: lost, verdict: { ok: false, what: "lost update", text: "T1's +10 vanished. both read 100, both wrote back their own sum." } },
              "repeatable read": { steps: rr, verdict: { ok: true, what: "lost update", text: "T2 failed with 40001 instead of overwriting. the app retries with fresh data." } },
            }}
          />
        </Figure>
        <Figure wide caption="the captured trace as lanes, with the versions on the page beside it.">
          <SessionLanes sessions={["T1"]} trace={trace} side="db" />
        </Figure>
      </Section>

      <Section id="page" title="PageView">
        <Figure wide caption="after two HOT updates inside T1: three versions of id 1 on the page. pick a line pointer.">
          <PageView page={trace.steps[2].heap!.accounts[0]} xact={trace.steps[2].xact} hot={[5]} provenance="real postgres 18.6 output · fixtures/update-twice, step 3" />
        </Figure>
        <Figure wide caption="after VACUUM: lp 1 is a redirect, the dead versions are gone.">
          <PageView page={trace.steps[last].heap!.accounts[0]} xact={trace.steps[last].xact} layout="bytes" />
        </Figure>
        <Figure wide caption="a reader's snapshot: live tint is what this repeatable read transaction really saw.">
          <PageView page={v.page} xact={v.xact} snap={v.snap} me={v.me} who="the reader" focus={6} fields={["id", "note"]} />
        </Figure>
      </Section>

      <Section id="chain" title="VersionChain">
        <Figure wide caption="step through the trace and switch who is looking.">
          <VersionChain trace={trace} select="id=1" start={2} />
        </Figure>
        <Figure wide caption="two sessions on a native server, lanes beside the chain: T2 keeps seeing the old balance; once nothing open needs the old versions they turn into dead ghosts.">
          <VersionChain trace={twice as unknown as PgTrace} select="accounts:id=1" lanes field="balance" who="T2" />
        </Figure>
      </Section>

      <Section id="btree" title="BTree">
        <Figure wide caption="type keys and step through the splits; switch to postgres rules and load the keys in order.">
          <BTree lab={{ order: 4 }} />
        </Figure>
        <Figure wide caption="a real index on 10,000 ints: root, 29 leaves, high keys, sibling links, and the heap blocks the TIDs point at.">
          <BTree view={btreeFromPages(btree.big as never)} heap collapse={4} pageCollapse={3} />
        </Figure>
      </Section>

      <Section id="plan" title="PlanTree">
        <Figure wide caption="the plan for the logical-order query, read bottom-up. toggle estimates and actual rows.">
          <PlanTree plan={explain.plans.logical.plan} provenance="real postgres 18.6 output · EXPLAIN (ANALYZE, BUFFERS)" />
        </Figure>
        <Figure wide caption="a hash join: build on products, probe with orders.">
          <PlanTree plan={explain.plans.join.plan} show={["actual", "est", "cost", "buffers"]} />
        </Figure>
        <Figure wide caption="press step: one next() at a time. LIMIT stops the scan after three rows.">
          <PlanTree
            mode="volcano"
            plan={withSim(fromExplainJson(explain.plans.limit.plan), [{ count: 3 }, { table: "products", where: [["price", ">", 50]], cols: ["id", "name", "price"] }])}
            tables={{ products: explain.products as never }}
          />
        </Figure>
      </Section>

      <Section id="join" title="JoinLab">
        <Figure wide caption="switch the join type: matches are live, outer joins add NULL-padded leftovers.">
          <JoinLab left={joins.left as never} right={joins.right as never} on={["id", "id"]} logical />
        </Figure>
        <Figure wide caption="the same join, four algorithms. watch the comparisons counter.">
          <JoinLab left={joins.left as never} right={joins.right as never} on={["id", "id"]} workMem={3} />
        </Figure>
      </Section>

      <Section id="pool" title="BufferPool">
        <Figure wide caption="step the requests: the clock hand sweeps for a victim. turn the ring off and the scan flushes the hot pages.">
          <BufferPool lab={{ frames: 9, policy: "clock-sweep", workload: "hot+scan", ring: 2 }} />
        </Figure>
        <Figure wide caption="the captured pool for the trace (pg_buffercache).">
          <BufferPool trace={trace} />
        </Figure>
      </Section>

      <Section id="wal" title="WalStrip">
        <Figure wide caption="the WAL as the trace runs: records stay in wal_buffers until a commit flushes them.">
          <WalStrip trace={trace} />
        </Figure>
        <Figure wide caption="crash after the second commit, then redo from the checkpoint.">
          <WalStrip view={{ ...traceWal(trace, 5)!, pages: [{ label: "accounts·0", lsn: trace.steps[5].heap!.accounts[0].lsn!, disk: trace.steps[0].heap!.accounts[0].lsn! }] }} mode="recovery" />
        </Figure>
        <Figure wide caption="textbook ARIES: analysis, redo, undo with CLRs.">
          <WalStrip mode="aries" />
        </Figure>
      </Section>

      <Section id="heapfile" title="HeapFile (P1)">
        <Figure wide caption="delete two rows in three: the file stays the same size. VACUUM turns dead rows into free space; only VACUUM FULL shrinks it.">
          <HeapFile
            steps={heapfile.stages.map((s, i) => ({
              view: { rel: "events", pages: s.pages },
              label: s.label,
              note: [
                "1,200 rows fill 15 pages. each bar is one page: live tuples at the bottom, a sliver of free space on top.",
                "two rows in three are deleted, but nothing moves: the old versions are still on every page, now dead.",
                "VACUUM removes the dead tuples and marks every page all-visible. the space is free for new rows, but the file is still 15 pages.",
                "VACUUM (FREEZE) also sets the all-frozen bit: these pages never need vacuuming for wraparound again.",
                "VACUUM FULL rewrites the table into a new file: 5 full pages. it needs an ACCESS EXCLUSIVE lock to do it.",
              ][i],
            }))}
          />
          <Provenance trace={{ engine: { version: "18.6" }, scenario: "fixtures/heapfile" }} />
        </Figure>
      </Section>

      <Section id="snap" title="SnapshotLine (P1)">
        <Figure wide caption="click an xid: is its work visible to this snapshot, and why.">
          <SnapshotLine snap={v.snap} xact={v.xact} me={v.me} range={[756, 765]} />
        </Figure>
        <Figure wide caption="drag the current xid around the ring: an unfrozen row's xmin falls out of the past.">
          <SnapshotLine ring={{ xmin: 1_000_000 }} />
        </Figure>
      </Section>

      <Section id="locks" title="WaitForGraph + LockTable (P1)">
        <Figure caption="two transfers in opposite order: each holds one row and waits for the other.">
          <WaitForGraph
            nodes={[{ id: "T1", sub: "pid 4101" }, { id: "row A", kind: "lock" }, { id: "T2", sub: "pid 4102" }, { id: "row B", kind: "lock" }]}
            holds={[["row A", "T1"], ["row B", "T2"]]}
            waits={[["T1", "row B"], ["T2", "row A"]]}
            cycle={[["T1", "row B"], ["T2", "row A"]]}
          />
        </Figure>
        <Figure wide caption="a long SELECT holds ACCESS SHARE; the ALTER queues for ACCESS EXCLUSIVE, and every SELECT after it queues behind the ALTER.">
          <LockTable
            matrix
            requests={[
              { txn: "T1", obj: "accounts", mode: "AccessShareLock", granted: true },
              { txn: "T2", obj: "accounts", mode: "AccessExclusiveLock", granted: false },
              { txn: "T3", obj: "accounts", mode: "AccessShareLock", granted: false },
              { txn: "T4", obj: "accounts", mode: "AccessShareLock", granted: false },
            ]}
          />
        </Figure>
      </Section>

      <Section id="hash" title="HashIndex (P1)">
        <Figure wide caption="insert keys until the index holds more than ffactor tuples per bucket: one bucket splits.">
          <HashIndex perBucket={4} />
        </Figure>
      </Section>

      <Section id="pgstepper" title="PgStepper">
        <Figure wide caption="the whole trace: sessions, the page, the version chain and the WAL, step by step.">
          <PgStepper trace={trace} panels={["lanes", "chain:accounts:id=1", "page:accounts", "wal"]} />
        </Figure>
      </Section>
    </main>
  );
}
