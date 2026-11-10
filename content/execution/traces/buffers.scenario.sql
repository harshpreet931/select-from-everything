-- @title one lookup run twice on a fresh copy of shop: read, then hit
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "the first run on a fresh database: 7 of the 9 pages it needs aren't in shared buffers yet."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT name FROM customers WHERE id IN (1, 500, 1000);

-- @step T1 "the same query again: all 9 pages are in shared buffers now. all hits, no reads."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT name FROM customers WHERE id IN (1, 500, 1000);
