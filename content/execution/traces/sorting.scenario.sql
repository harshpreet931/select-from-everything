-- @title sorting events: quicksort, top-N heapsort and external merge at three work_mem settings, then an incremental sort
-- @engine pglite
-- @db events
-- @each

-- @step T1 "4MB of work_mem: all 25,000 rows fit, so they're sorted in memory with quicksort."
SET work_mem = '4MB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, user_id, kind, occurred_at FROM events ORDER BY kind, occurred_at DESC;

-- @step T1 "with LIMIT 10 the sort only ever keeps the best 10 rows, in a heap: a top-N heapsort."
SET work_mem = '4MB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, user_id, kind, occurred_at FROM events ORDER BY kind, occurred_at DESC LIMIT 10;

-- @step T1 "1MB: the rows don't fit. sorted runs go to temp files on disk and are merged at the end: an external merge."
SET work_mem = '1MB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, user_id, kind, occurred_at FROM events ORDER BY kind, occurred_at DESC;

-- @step T1 "the same LIMIT 10 at 1MB: still a top-N heapsort in a few kB. 10 rows always fit."
SET work_mem = '1MB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, user_id, kind, occurred_at FROM events ORDER BY kind, occurred_at DESC LIMIT 10;

-- @step T1 "64kB, the minimum: many more, smaller runs to write and merge. more temp traffic for the same 25,000 rows."
SET work_mem = '64kB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, user_id, kind, occurred_at FROM events ORDER BY kind, occurred_at DESC;

-- @step T1 "even at 64kB, keeping 10 rows is easy. no disk at all."
SET work_mem = '64kB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, user_id, kind, occurred_at FROM events ORDER BY kind, occurred_at DESC LIMIT 10;

-- @step T1 "no index: sorting by user_id, occurred_at means reading all 25,000 rows into a top-N heapsort."
RESET work_mem;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, user_id, occurred_at FROM events ORDER BY user_id, occurred_at LIMIT 10;

-- @step T1 "an index on user_id hands rows over sorted by user_id. sorting by user_id, occurred_at then only means sorting within each user."
RESET work_mem;
CREATE INDEX ON events (user_id);
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, user_id, occurred_at FROM events ORDER BY user_id, occurred_at LIMIT 10;
