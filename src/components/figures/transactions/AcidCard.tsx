import { Provenance } from "@/components/figures/kit";

// server side, static: the four letters, each with what it promises, what keeps the promise in
// postgres, and the thing people assume it covers but it doesn't. the links go to the chapters
// that show each mechanism on a real server. textbook material, so it says "drawn by hand".

type Letter = { l: string; name: string; promise: string; kept: React.ReactNode; not: string };

const LETTERS: Letter[] = [
  {
    l: "A",
    name: "atomicity",
    promise: "all of a transaction's changes happen, or none of them do.",
    kept: (
      <>
        one commit record in the <a href="/learn/wal/commit-path">WAL</a>; an aborted transaction's versions are just ignored (<a href="/learn/mvcc/commit-log-and-hint-bits">the commit log</a>)
      </>
    ),
    not: "that your app notices the failure and tries again.",
  },
  {
    l: "C",
    name: "consistency",
    promise: "a commit takes the data from one valid state to another.",
    kept: (
      <>
        the <a href="/learn/design/constraints">constraints</a> you declare (CHECK, UNIQUE, foreign keys), and your code for every rule you didn't
      </>
    ),
    not: "rules nobody told the database, like alice + bob = 200.00.",
  },
  {
    l: "I",
    name: "isolation",
    promise: "transactions running at once don't see or wreck each other's half-done work.",
    kept: (
      <>
        <a href="/learn/mvcc/snapshots">snapshots</a>, row locks, and <a href="/learn/locking/ssi">SSI</a> at SERIALIZABLE
      </>
    ),
    not: "that the default level stops every anomaly. READ COMMITTED doesn't.",
  },
  {
    l: "D",
    name: "durability",
    promise: "once COMMIT returns, the change survives a crash.",
    kept: (
      <>
        the <a href="/learn/wal/write-ahead-rule">WAL</a>, flushed to disk before COMMIT returns, and <a href="/learn/wal/crash-recovery">crash recovery</a>
      </>
    ),
    not: "a dead disk, a DROP TABLE, or synchronous_commit = off.",
  },
];

export function AcidCard() {
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <dl className="grid gap-2">
        {LETTERS.map((x) => (
          <div key={x.l} className="grid grid-cols-[2.4rem_minmax(0,1fr)] gap-x-3 rounded-md bg-well px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
            <dt className="row-span-3 font-display text-[2.1rem] leading-none font-light text-hi" aria-label={x.name}>
              {x.l}
            </dt>
            <dd className="text-hi">
              {x.name} <span className="text-faint">·</span> <span className="font-serif text-[1.02rem] text-ink">{x.promise}</span>
            </dd>
            <dd className="mt-1 text-11 text-mute [&_a]:text-link [&_a]:underline [&_a]:decoration-line-2 [&_a]:underline-offset-2">
              <span className="text-faint">kept by </span>
              {x.kept}
            </dd>
            <dd className="mt-0.5 text-11 text-mute">
              <span className="text-faint">doesn&apos;t cover </span>
              {x.not}
            </dd>
          </div>
        ))}
      </dl>
      <Provenance drawn />
    </div>
  );
}
