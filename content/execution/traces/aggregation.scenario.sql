-- @title GROUP BY on events: hashed, sorted, mixed, spilled, and split into partial aggregates
-- @engine pglite
-- @db events
-- @each

-- @step T1 "twelve events and their kinds, in the order the table holds them."
SELECT id, kind FROM events WHERE id BETWEEN 20001 AND 20012 ORDER BY id;

-- @step T1 "the same twelve, grouped by kind: the answer both strategies have to reach."
SELECT kind, count(*) FROM events WHERE id BETWEEN 20001 AND 20012 GROUP BY kind ORDER BY kind;

-- @step T1 "events per user. nothing is sorted by user_id, so postgres hashes: one pass, one hash table entry per user."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT user_id, count(*) FROM events GROUP BY user_id;

-- @step T1 "the same with hash aggregation switched off: sort all 25,000 rows by user_id first, then count each run of equal ids."
SET enable_hashagg = off;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT user_id, count(*) FROM events GROUP BY user_id;

-- @step T1 "ROLLUP: three groupings at once. two are hashed in one pass; the grand total needs no hashing at all."
RESET enable_hashagg;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT kind, user_id, count(*) FROM events GROUP BY ROLLUP (kind, user_id);

-- @step T1 "with ORDER BY user_id on top: group first by hashing, then sort just the 500 groups."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT user_id, count(*) FROM events GROUP BY user_id ORDER BY user_id;

-- @step T1 "the default 4MB: a sum and a count per user, all 500 groups in one hash table."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT user_id, count(*), sum(amount) FROM events GROUP BY user_id;

-- @step T1 "64kB: the hash table outgrows its budget. groups that don't fit are spilled to disk and finished in later batches."
SET work_mem = '64kB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT user_id, count(*), sum(amount) FROM events GROUP BY user_id;

-- @step T1 "with an index on user_id, the rows arrive sorted by user_id for free, and grouping just streams: a GroupAggregate with no Sort."
RESET work_mem;
CREATE INDEX ON events (user_id);
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT user_id, count(*) FROM events GROUP BY user_id;
