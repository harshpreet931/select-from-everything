-- @title autovacuum switched on with a one-second nap: 300 dead rows in a 1,000-row table, and the worker that comes for them
-- @server autovacuum=on autovacuum_naptime=1s autovacuum_vacuum_threshold=2000000000 autovacuum_analyze_threshold=2000000000 autovacuum_vacuum_insert_threshold=-1 log_autovacuum_min_duration=-1
-- @sessions T1
-- @each

-- @setup
-- server-wide thresholds are raised out of reach so the catalogs are left alone and the run
-- repeats exactly. t gets the default vacuum threshold back, and its worker's log line.
CREATE TABLE t (id int PRIMARY KEY, n int NOT NULL)
  WITH (autovacuum_vacuum_threshold = 50, autovacuum_vacuum_scale_factor = 0.2,
        log_autovacuum_min_duration = 0);
INSERT INTO t SELECT g, 0 FROM generate_series(1, 1000) AS g ORDER BY g;
VACUUM (ANALYZE) t;

-- @step T1 "the processes of a real server. one of them is the autovacuum launcher, which wakes every autovacuum_naptime and decides which tables need a worker."
SELECT backend_type, count(*) FROM pg_stat_activity GROUP BY backend_type ORDER BY backend_type;

-- @step T1 "a 1,000-row table, just vacuumed. its vacuum threshold is 50 + 0.2 × 1,000 = 250 dead rows."
SELECT reltuples, 50 + 0.2 * reltuples AS threshold FROM pg_class WHERE relname = 't';

-- @step T1 "delete 300 rows: 50 past the threshold. the statistics system counts them as dead."
DELETE FROM t WHERE id <= 300;
SELECT pg_stat_force_next_flush();
SELECT n_dead_tup, autovacuum_count FROM pg_stat_user_tables WHERE relname = 't';

-- @step T1 +log "wait three seconds. the launcher wakes every second, finds t over its threshold, and starts a worker, which logs what it did."
SELECT pg_sleep(3);

-- @step T1 "the counters after: no dead rows left, and one automatic vacuum."
SELECT pg_stat_force_next_flush();
SELECT n_dead_tup, autovacuum_count FROM pg_stat_user_tables WHERE relname = 't';
