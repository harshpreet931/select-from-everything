-- @title an index on (a, b): six values of a, forty of b, and the entries each query needs
-- @engine pglite
-- @each

-- composite-indexes and skip-scan read this file. the index is built with fillfactor 10 so that
-- 240 entries spread over seven leaf pages instead of fitting on one. each query runs twice:
-- once for its rows (which entries match), once under EXPLAIN (ANALYZE, BUFFERS).

-- @setup
CREATE TABLE ab (a int NOT NULL, b int NOT NULL);
INSERT INTO ab SELECT a, b FROM generate_series(1, 6) AS a, generate_series(1, 40) AS b ORDER BY a, b;
CREATE INDEX ab_a_b ON ab (a, b) WITH (fillfactor = 10);
VACUUM ANALYZE ab;

-- @probe +btree(ab_a_b) "the index: 240 entries on seven leaf pages, sorted by a, then by b within each a."

-- @step T1 "seq scans off: the table itself is two pages, and postgres would rather just read them."
SET enable_seqscan = off;

-- @step T1 "a = 3: forty entries, one after another."
SELECT a, b FROM ab WHERE a = 3 ORDER BY a, b;
-- @explain T1 "a = 3: one descent to the first (3, 1), then read forward until a changes."
SELECT a, b FROM ab WHERE a = 3;

-- @step T1 "a = 3 and b > 30: the tail of the same run."
SELECT a, b FROM ab WHERE a = 3 AND b > 30 ORDER BY a, b;
-- @explain T1 "a = 3 and b > 30: the descent goes straight to (3, 31), and the scan stops at the end of a = 3."
SELECT a, b FROM ab WHERE a = 3 AND b > 30;

-- @step T1 "a = 3 and b = 7: exactly one entry."
SELECT a, b FROM ab WHERE a = 3 AND b = 7 ORDER BY a, b;
-- @explain T1 "a = 3 and b = 7: one descent, one entry."
SELECT a, b FROM ab WHERE a = 3 AND b = 7;

-- @step T1 "b = 7 alone: one entry inside every value of a, spread across the whole index."
SELECT a, b FROM ab WHERE b = 7 ORDER BY a, b;
-- @explain T1 "b = 7: postgres 18 hops, one descent per value of a (a skip scan)."
SELECT a, b FROM ab WHERE b = 7;

-- @step T1 "a between 2 and 4 and b = 7: a range on the first column, equality on the second."
SELECT a, b FROM ab WHERE a BETWEEN 2 AND 4 AND b = 7 ORDER BY a, b;
-- @explain T1 "a between 2 and 4 and b = 7: a hop per value of a in the range."
SELECT a, b FROM ab WHERE a BETWEEN 2 AND 4 AND b = 7;
