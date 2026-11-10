import { FIG_TABLE, Provenance } from "@/components/figures/kit";

// server side, static: postgres's three kinds of lock side by side, as the source describes them
// (src/backend/storage/lmgr/README, s_lock.h, lwlock.c). drawn by hand.

const COLS = ["spinlock", "LWLock", "heavyweight lock"];
const ROWS: [string, string, string, string][] = [
  ["protects", "a few fields of shared memory", "a shared structure: a buffer's contents, the WAL insert position, a lock-table partition", "a database object: a table, a transaction, a row in line, an advisory number"],
  ["held for", "a few instructions", "microseconds, never across a client round trip", "until the transaction ends (usually)"],
  ["modes", "one", "shared or exclusive", "eight table modes, plus others for other objects"],
  ["a waiter", "spins, then sleeps briefly (SpinDelay)", "sleeps on a semaphore", "sleeps in a queue, first come first served"],
  ["deadlock detection", "no: code must never hold one long", "no: code takes them in a fixed order", "yes, after deadlock_timeout"],
  ["released on error", "never needed: nothing that can fail runs while one is held", "yes", "yes, at abort"],
  ["you can see it in", "wait_event Timeout:SpinDelay", "wait_event_type LWLock", "pg_locks, and wait_event_type Lock"],
];

export function LockKinds() {
  return (
    <div className="grid min-w-0 gap-2 grid-cols-[minmax(0,1fr)]">
      <div className="min-w-0 overflow-x-auto">
        <table className={`w-full min-w-[560px] border-collapse text-11 leading-[1.5] ${FIG_TABLE}`}>
          <thead>
            <tr>
              <th className="border-0 px-2 py-1.5 text-left text-faint" />
              {COLS.map((c, i) => (
                <th key={c} className="border-0 px-2 py-1.5 text-left" style={{ color: i === 1 ? "var(--hot)" : i === 2 ? "var(--meta)" : "var(--hi)" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r[0]} className="border-t border-line align-top">
                <td className="px-2 py-1.5 whitespace-nowrap text-faint">{r[0]}</td>
                {r.slice(1).map((v, i) => (
                  <td key={i} className="px-2 py-1.5 text-ink">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Provenance drawn="from the postgres source: src/backend/storage/lmgr/README" />
    </div>
  );
}
