# pgtrace

runs a scenario on a real postgres and writes down what the server looked like after every step: transaction ids and snapshots, locks, the buffer pool, WAL records, heap and index pages, plans. the output is the `PgTrace` json from `src/lib/db/pgtrace.ts`, the thing the database figures draw.

real execution, not hand-made data. if a figure says T2 waited for T1's ShareLock on transaction 759, it's because `pg_locks` said so.

## usage

```sh
pnpm pgtrace content/mvcc/traces/update-twice.scenario.sql    # → update-twice.pgtrace.json next to it
pnpm pgtrace content/transactions                             # every scenario under a folder
pnpm pgtrace                                                  # every scenario in content/
pnpm pgtrace <files> --twice                                  # run twice, fail if the runs differ
pnpm pgtrace <files> --check                                  # re-run and compare with the committed json
pnpm pgtrace <file> --engine=pglite                           # PGlite in node instead of a native server
```

- `--check`: writes nothing. fails if the new run differs from the committed `.pgtrace.json` (volatile parts ignored). run it after a postgres minor bump.
- `--twice`: catches nondeterminism the scenario doesn't control. every new scenario should pass it before it's committed.
- `--engine=pglite`: one session only, no `blocks`, no `@crash`. for single-session captures that should match what the in-browser engine does. the trace then says `engine.build: "PGlite 0.5.12"`.
- `--keep`: keep the throwaway cluster directory (the path is printed) so you can poke at it.
- `--quiet`: only print problems. `PGTRACE_VERBOSE=1` prints every step as it runs.
- exit codes: 0 fine, 1 a scenario failed or differs, 2 usage, 3 no usable postgres.

needs postgres 18 binaries: `PG_BIN=/path/to/bin`, or Postgres.app 18 (`/Applications/Postgres.app/Contents/Versions/18/bin`), or the PGDG package (`/usr/lib/postgresql/18/bin`). the major version must match `pg.major` in `src/lib/site.ts`, or nothing runs. a scenario takes 1 to 2 seconds.

## safety

every run starts its own cluster: a copy of a cached `initdb` template in `os.tmpdir()`, listening only on a unix socket in its own directory (`listen_addresses = ''`), stopped and deleted when the run ends, even on ctrl-c. pgtrace never connects to, signals or reads a server it didn't start. `PG*` environment variables are dropped before anything runs, so they can't point it elsewhere. the cluster code is `scripts/lib/native-pg.mjs` (shared with `sql-check --engine=native`).

## a scenario

```sql
-- @title T1 updates a balance twice while T2, at repeatable read, keeps reading
-- @sessions T1 T2
-- @each xids heap(accounts)

-- @setup
CREATE TABLE accounts (id int PRIMARY KEY, owner text NOT NULL, balance numeric(12,2) NOT NULL);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T2 "T2 opens a repeatable read transaction."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 "T2's first read takes its snapshot."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 blocks "T1 waits for T2's lock."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;
```

a step's sql runs until the next directive. whole-line `--` comments inside a step are dropped. one statement per step reads best; several are fine (they run one after another, the step shows the last result).

### header

| directive | what it does |
| --- | --- |
| `-- @title text` | one lowercase line. defaults to the file name |
| `-- @sessions T1 T2` | session names, in connection order. default `T1`. `obs` and `server` are taken |
| `-- @session T2 key=value …` | `SET` for one session at connect, e.g. `deadlock_timeout=10ms` |
| `-- @server key=value …` | extra `postgresql.conf` settings for the cluster (survive a crash and restart) |
| `-- @engine native \| pglite` | default native. `--engine` on the command line wins |
| `-- @db shop` | load `datasets/shop` first (its files in order, `VACUUM ANALYZE`, `CHECKPOINT`), like the site seeds it |
| `-- @ext pg_trgm …` | more extensions. pageinspect, pg_buffercache, pg_visibility, pg_freespacemap and pg_walinspect are always created |
| `-- @checksums` | `initdb --data-checksums` (off otherwise) |
| `-- @each probe probe …` | the probes after every following step. can appear again later to change them. default: `xids locks` with two or more sessions, `xids` with one |
| `-- @setup` | sql that builds the scenario's tables. runs before any session connects, statement by statement, so `VACUUM` works. scenarios make their own small tables here |

order inside the cluster before step 0: `@db`, then the inspection extensions, then `@setup`, then a `VACUUM` of the system catalogs (so a probe's first function lookup doesn't prune dead catalog tuples and write WAL nobody asked for), then the sessions connect.

### steps

| directive | what it does |
| --- | --- |
| `-- @step T1 [flags] "note"` | run the sql in session T1 |
| `-- @step obs "note"` | run it in the observer session (`VACUUM`, `CHECKPOINT`, a pageinspect query you want as the step's result). never blocks |
| `-- @explain T1 [noanalyze] "note"` | `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF, FORMAT JSON)` of the sql, in T1. INSERT / UPDATE / DELETE / MERGE are wrapped in `BEGIN … ROLLBACK` (or a savepoint inside a transaction), so the data doesn't change but xids are still used. `noanalyze`: plain `EXPLAIN (FORMAT JSON)`, costs only. the plan goes to `step.explain` |
| `-- @stages T1 "note"` | the query, then `-- @stage FROM`, `-- @stage WHERE "note"`, … blocks, each a real query whose result is that clause's intermediate table. `-- @stage ORDER BY group=dept` marks the column whose runs of equal values the stepper shades (it goes to the stage as `group`). without `@stage` blocks, a plain SELECT (no GROUP BY / HAVING / WINDOW / DISTINCT) gets FROM, WHERE, SELECT, ORDER BY, LIMIT prefixes derived for it. goes to `step.stages`, the full query's result to `step.result` |
| `-- @probe [+probe …] "note"` | no sql, just look |
| `-- @crash "note"` | `pg_ctl stop -m immediate` (see crashes, below) |
| `-- @restart [+log] "note"` | `pg_ctl start`, sessions reconnect. crash recovery runs here |

step flags:

- `blocks`: the step is expected to wait for a lock. the step is sent, then pgtrace polls `pg_isolation_test_session_is_blocked(pid, other session pids)`. blocked for the whole 500 ms window means blocked: the step gets `status: "blocked"`, `blocked: { by, lock }`, and the session stays waiting. after every later step, waiting sessions are drained: once one finishes, the later step gets a `woke` entry with its result or error. a step that blocks without the flag fails the run, and so does a flagged step that doesn't block.
- `errors=40001`: the step (or, for a `blocks` step, the statement once it wakes) must fail with that SQLSTATE. `errors` alone accepts any. an error without the flag fails the run.
- `+probe` / `-probe`: add a probe for this step, or drop one (`-heap` drops every heap probe, `-heap(accounts)` just that one).

a session that's waiting can't run anything else; the run fails if a step tries.

### probes

they always run in this order, in the observer connection, after the step (and after any woken session finished):

| # | probe | reads | lands in |
| --- | --- | --- | --- |
| 1 | `xids` | `pg_stat_activity` (xid, in transaction), `SHOW transaction_isolation` and `pg_current_snapshot()` inside idle sessions (see observer effects) | `xids`, `xact` |
| 2 | `locks` | `pg_locks` for the sessions, pids replaced by session names | `locks` |
| 3 | `buffers` | `pg_buffercache` frames for the scenario's relations, `pg_buffercache_summary()` | `buffers` |
| 4 | `wal` | insert and flush LSN, `pg_control_checkpoint()` redo and checkpoint LSN, records (below) | `wal` |
| 5 | `heap(rel[, 0-3])` | `page_header`, `heap_page_items`, `heap_tuple_infomask_flags`, `tuple_data_split` decoded (ints, bool, numeric, text, dates, timestamps, uuid; anything else as hex). blocks 0-3 unless you pass a range | `heap` |
| 5 | `btree(idx[, items=N])` | `bt_metap`, `bt_page_stats`, `bt_page_items` for every page, keys decoded. high key split out, internal items carry the downlink in `tid`. `items=N` keeps the first and last N/2 per page and records the real count in `n` | `btree` |
| 5 | `hash(idx)` | `hash_metapage_info`, `hash_page_type`, `hash_page_stats`, `hash_page_items` | `hash` |
| 5 | `vm(rel)` / `fsm(rel)` | `pg_visibility_map`, `pg_freespace` | `vm`, `fsm` |
| 6 | `rows(rel)` | `SELECT ctid, * FROM rel ORDER BY ctid`, as a brand-new transaction | `rows` |
| 8 | `stats[(rel, …)]` | `pg_stat_all_tables` / `_indexes` + `pg_statio_*`, after `pg_stat_force_next_flush()` in each idle session | `stats` |
| 10 | `log` | server log lines since the last log probe (`log_line_prefix = ''`) | `log` |

`xact` (commit status from `pg_xact_status`) is filled in for every xid that shows up in `xids` or in a heap probe. multixact xmax values are skipped.

### WAL records

`pg_walinspect` can only read WAL up to the flush pointer, so a step's records are read in bulk afterwards: at the end of the run (after a non-transactional `pg_logical_emit_message(…, flush => true)` that sits after every step's records) and just before a crash. a step with the `wal` probe gets every record inserted since the previous step with the `wal` probe. records past that step's `flush` were still only in `wal_buffers` at the time; the figure can draw them dashed.

records flagged `volatile: true` are ones postgres writes on its own clock: `Standby RUNNING_XACTS` and checkpoint records in a step that didn't ask for a checkpoint. `--check` and `--twice` ignore them.

## crashes

`@crash` runs the step's probes first (`wal` and `buffers` are always on for it), reads the WAL, then `pg_ctl stop -m immediate`. every backend dies without a checkpoint. then:

- `control`: `pg_controldata` (cluster state, latest checkpoint, REDO location, NextXID…).
- `wal.records` on the crash step: `pg_waldump -s <redo>`, everything on disk from the redo pointer, which is exactly what recovery is about to replay.
- sessions that were waiting get a `woke` entry with `57P01`.

`@restart` starts the server, reconnects every session (new backends, new pids), and with `+log` keeps the log lines: "database system was interrupted", "redo starts at", "redo done at", the end-of-recovery checkpoint. probes after it show the recovered state: xids that were in progress at the crash now report `aborted`, their tuples still on the page.

this is a process crash, not a power cut: the OS page cache survives, so WAL that was written but not yet flushed can survive too. to show a lost async commit, use `-- @server synchronous_commit=off wal_writer_delay=10s` and crash right after the COMMIT.

## determinism

every run gets a fresh cluster from the same template, so xids, oids and LSNs repeat exactly. the template is `initdb --no-locale -E UTF8 -U postgres --auth=trust --no-sync --no-data-checksums` (checksums on with `@checksums`). the server runs with:

| setting | why |
| --- | --- |
| `autovacuum = off` | nothing vacuums behind the scenario's back |
| `checkpoint_timeout = 1d`, `max_wal_size = 4GB` | no checkpoint you didn't ask for |
| `bgwriter_lru_maxpages = 0` | the background writer never writes pages, so dirty stays dirty |
| `wal_writer_delay = 10s` | the WAL writer doesn't flush mid-scenario, so the flush pointer only moves on commit |
| `jit = off`, `max_parallel_workers_per_gather = 0`, `synchronize_seqscans = off` | plans and scans don't depend on timing or other backends |
| `deadlock_timeout = 100ms` | per session with `@session` to pick the deadlock victim: the session whose timer fires after the cycle closes is the one killed |
| `TimeZone = UTC`, `DateStyle = 'ISO, MDY'`, `lc_messages = C`, `extra_float_digits = 1` | output text matches the browser engine |
| `log_checkpoints = on`, `log_line_prefix = ''` | the log probe reads clean lines |

`wal_level = replica` and `full_page_writes = on` stay at their defaults, so WAL looks like a real server's. raw values are kept: xids are numbers, LSNs are numbers (asserted below 2^53), page offsets are numbers. pids, timestamps, timings and the cluster's directory are replaced at capture (`process T2`, `<time>`, `<t> s`, `<dir>`), because they change on every run.

## observer effects

looking changes things. the rules pgtrace follows, and the ones you have to know:

- it never calls `txid_current()` (that assigns an xid). it reads xids from `pg_stat_activity`.
- it never asks a repeatable read or serializable session for its snapshot before that transaction's first real statement: `pg_current_snapshot()` would *take* the snapshot right there. `BEGIN`, `SET`, `SHOW`, `LOCK`, `SAVEPOINT` don't take one, everything else does. a waiting session's snapshot is the last one seen.
- the observer runs with `track_counts = off`, so its own page reads never show up in `stats`. @setup runs in its own connection with counting on, like a real load.
- `get_raw_page` reads through shared buffers: it loads pages and bumps usage counts. that's why `buffers` runs before the page probes, and why buffer pool scenarios should leave page probes off.
- `rows(rel)` is a real `SELECT`: it sets hint bits (dirtying the page) and can prune, and the next step will see that. use it sparingly, or make the read a step (that's often the point of the figure anyway).
- with `@checksums`, setting a hint bit after a checkpoint writes an `FPI_FOR_HINT` record.
- on `--engine=pglite` there is one backend: probes run inside the scenario's session and its transaction, and the observer's reads count in `stats`.

## size

a trace is imported by an mdx page and ends up in the page's payload. pgtrace warns above 60 KB (minified). narrow it: fewer probes in `@each`, a block range (`heap(t, 0)`), `btree(idx, items=6)`, `-probe` on steps that don't need it.

## output

the `PgTrace` shape in `src/lib/db/pgtrace.ts`, plus a few fields the type doesn't list yet: `step.fsm`, `step.rows`, `trace.db`, `engine.build` (PGlite runs), `rels[idx].on` (the table an index is on), `n` on trimmed btree pages, and `sql` / `note` / `types` (column types, parallel to `columns`) on each stage. `result.command` is the bare command (`UPDATE`) and `result.rows` the count from the tag, so adapters can rebuild psql's `UPDATE 1`.

the json is written with small objects on one line, so a re-capture diffs readably in review.

## known limits

- blocking detection asks `pg_isolation_test_session_is_blocked()`, the check postgres's own isolation tester uses, so it sees every heavyweight-lock wait, several sessions waiting at once (a queue behind one lock, a deadlock cycle), and serializable safe-snapshot waits (`DEFERRABLE`). the locks probe names who blocks whom with `pg_blocking_pids()`; a safe-snapshot wait has no lock row, so its `blocked.lock` is null. what it can't see: buffer pin waits, LWLocks and I/O waits (a step stuck on one times out after 30 s).
- after an error inside BEGIN, the session's status is read once postgres's ReadyForQuery arrives, so lanes show the failed transaction (`E`) on the step that failed.
- the catalog differs a little between platforms (ICU collations), so oids and toast table names can differ between a mac capture and a linux one. keep traces from one platform, and re-capture on the nightly runner if they drift.
- `@stages` derives prefixes only for a plain SELECT; anything with groups or windows needs explicit `-- @stage` blocks.
- the `xids` probe's snapshot for a read committed session is taken at probe time (`pg_current_snapshot()` after the step), not the snapshot the step's statement used: under read committed every statement takes a fresh one, so the lane header shows what the session's next statement would see. repeatable read and serializable keep one snapshot for the whole transaction, so theirs is exact.
- a session the server ends (idle_in_transaction_session_timeout, pg_terminate_backend) is marked dead by the next `xids` probe; its later steps can't run.
- `@crash` names every relfilenode before stopping the server, so WAL read afterwards (pg_waldump) still has relation names; a relation created after the last probe shows as `filenode N`.
