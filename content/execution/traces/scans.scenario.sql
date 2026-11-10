-- @title three ways to read events, the order each one visits pages in, and a bitmap that goes lossy
-- @engine pglite
-- @db events
-- @each

-- @step T1 "two plain b-tree indexes. events has none of its own."
CREATE INDEX ON events (user_id);
CREATE INDEX ON events (kind);

-- @step T1 "the planner's choice for three users' events: a bitmap scan."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, kind FROM events WHERE user_id BETWEEN 7 AND 9;

-- @step T1 "bitmap and seq scans switched off, so it has to walk the index and fetch row by row."
SET enable_bitmapscan = off;
SET enable_seqscan = off;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, kind FROM events WHERE user_id BETWEEN 7 AND 9;

-- @step T1 "both index paths switched off: read every page and test every row."
RESET enable_seqscan;
SET enable_indexscan = off;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id, kind FROM events WHERE user_id BETWEEN 7 AND 9;

-- @step T1 "the heap page of every matching row, in the order the index holds them: by user_id, then by ctid."
RESET ALL;
SELECT (ctid::text::point)[0]::int AS page
FROM events
WHERE user_id BETWEEN 7 AND 9
ORDER BY user_id, ctid;

-- @step T1 "two conditions, two indexes, one bitmap each, ANDed before the heap is touched."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id FROM events WHERE kind = 'signup' AND user_id BETWEEN 7 AND 30;

-- @step T1 "the same two indexes ORed."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id FROM events WHERE kind = 'signup' OR user_id = 7;

-- @step T1 "a wide table: 30,000 rows of about 430 bytes, 1,728 pages. sensor 7 has one row in every 20, so it's on almost every page."
CREATE TABLE readings AS
SELECT g AS id, g % 20 AS sensor, (g * 7919) % 1000 AS value, repeat('x', 400) AS note
FROM generate_series(1, 30000) AS g
ORDER BY g;
CREATE INDEX ON readings (sensor);
VACUUM ANALYZE readings;

-- @step T1 "the default work_mem, 4MB: the bitmap remembers every matching row."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT sum(value) FROM readings WHERE sensor = 7;

-- @step T1 "work_mem at its minimum, 64kB: too small for one entry per page, so part of the bitmap only remembers pages."
SET work_mem = '64kB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT sum(value) FROM readings WHERE sensor = 7;
