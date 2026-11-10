// wait events sampled under contention on a native postgres 18.6 server (Postgres.app, an
// apple m4 pro, 14 cores), one run, numbers as recorded. method: a throwaway cluster started with
// scripts/lib/native-pg.mjs (default settings plus max_connections = 100); for each workload,
// pgbench -n -c 32 -j 8 -T 8 runs a one-line script, and after 1.5 s a separate connection reads
// pg_stat_activity (wait_event_type, wait_event of active pgbench backends) every 10 ms for 5 s.
// a count is "backends seen in that state, summed over all samples": 32 backends x ~440 samples.
// numbers change from run to run (a second run gave the same ordering, within about 15 percent).
// "running:(cpu)" is wait_event_type null: the backend was running, not waiting.

export type WaitSample = { workload: string; sql: string; samples: number; tps: number; counts: Record<string, number> };

export const LATCH_SAMPLES: WaitSample[] = [
  {
    "workload": "one-row-update",
    "sql": "UPDATE hot SET n = n + 1 WHERE id = 1;",
    "samples": 437,
    "tps": 13147,
    "counts": {
      "LWLock:LockManager": 6259,
      "Lock:transactionid": 4353,
      "Lock:tuple": 1504,
      "running:(cpu)": 1092,
      "IO:WalWrite": 304,
      "LWLock:BufferContent": 215,
      "Client:ClientRead": 37,
      "Timeout:SpinDelay": 12,
      "LWLock:XidGen": 3,
      "LWLock:ProcArray": 2,
      "IO:WalInitWrite": 2,
      "IO:WalInitSync": 1
    }
  },
  {
    "workload": "one-row-select",
    "sql": "SELECT n FROM hot WHERE id = 1;",
    "samples": 445,
    "tps": 275031,
    "counts": {
      "Client:ClientRead": 930,
      "running:(cpu)": 757
    }
  },
  {
    "workload": "append-insert",
    "sql": "INSERT INTO log (v) VALUES (1);",
    "samples": 439,
    "tps": 89063,
    "counts": {
      "LWLock:WALWrite": 6624,
      "LWLock:BufferContent": 1483,
      "running:(cpu)": 1065,
      "Client:ClientRead": 594,
      "IO:WalWrite": 303,
      "LWLock:WALInsert": 167,
      "Timeout:SpinDelay": 87,
      "IPC:ProcarrayGroupUpdate": 76,
      "LWLock:ProcArray": 43,
      "Lock:extend": 37,
      "IPC:XactGroupUpdate": 33,
      "LWLock:XidGen": 32,
      "LWLock:LockManager": 18,
      "LWLock:XactSLRU": 15,
      "IO:DataFileExtend": 12,
      "IO:WalInitWrite": 11,
      "LWLock:WALBufMapping": 1,
      "IO:SlruWrite": 1
    }
  }
];
