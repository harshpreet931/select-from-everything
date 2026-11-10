-- @title parallel query on a real postgres 18.6 server: a 2-million-row table, then events with the browser's settings
-- @db events
-- @sessions T1
-- @each

-- @setup
-- a table big enough that the planner wants workers on its own (the default
-- min_parallel_table_scan_size is 8MB). statistics on k use a target of 10,000, so ANALYZE
-- reads every row and the estimates are the same on every run.
CREATE TABLE big AS
SELECT g AS id, g % 1000 AS k, (g::bigint * 7919 % 100000)::int AS v
FROM generate_series(1, 2000000) AS g
ORDER BY g;
ALTER TABLE big ALTER COLUMN k SET STATISTICS 10000;
VACUUM ANALYZE big;

-- @step T1 "the size of big, and the planner settings that decide how many workers it gets."
SELECT pg_size_pretty(pg_relation_size('big')) AS size,
       current_setting('min_parallel_table_scan_size') AS min_scan,
       current_setting('max_parallel_workers') AS max_workers;

-- @step T1 "this cluster starts with max_parallel_workers_per_gather = 0, like the browser. so: one process, one Seq Scan."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT count(*) FROM big;

-- @step T1 "allow up to 4 workers per Gather. the planner asks for 3 (from the table's size), all 3 start, and the leader works too: four processes split the table."
SET max_parallel_workers_per_gather = 4;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT count(*) FROM big;

-- @step T1 "a GROUP BY in parallel: each process aggregates its share, the partial groups are merged in order, and a final aggregate combines them."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT k, count(*) FROM big GROUP BY k ORDER BY k;

-- @step T1 "events, with the thresholds lowered so a small table gets workers too: the query the browser runs below. here, 4 workers start."
SET min_parallel_table_scan_size = 0;
SET parallel_setup_cost = 0;
SET parallel_tuple_cost = 0;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT count(*) FROM events;
