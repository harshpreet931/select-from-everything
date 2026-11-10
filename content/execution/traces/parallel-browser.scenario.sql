-- @title the same parallel-friendly settings in the browser engine, which has no worker processes
-- @engine pglite
-- @db events
-- @each

-- @step T1 "the browser engine is one process with no room for background workers."
SELECT current_setting('max_worker_processes') AS max_worker_processes,
       current_setting('max_parallel_workers') AS max_parallel_workers;

-- @step T1 "the same settings and query as on the server. the planner still plans 4 workers; none can start, so the leader scans all of events alone."
SET max_parallel_workers_per_gather = 4;
SET min_parallel_table_scan_size = 0;
SET parallel_setup_cost = 0;
SET parallel_tuple_cost = 0;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT count(*) FROM events;
