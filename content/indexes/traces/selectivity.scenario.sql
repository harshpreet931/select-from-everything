-- @title one query at six selectivities, on a column scattered through the table and on one stored in its order
-- @engine pglite
-- @each

-- index-or-scan reads this file. t has 30,000 rows (so ANALYZE reads all of them and the
-- statistics are exact). k is 0..29,999 shuffled, so k < n matches exactly n rows, spread over
-- the whole table. k_sorted is the same numbers in table order. steps 0-11 are the plans postgres
-- picks, step 13 the one point that changes at random_page_cost 1.1, and the last step forces
-- each of the three scans at every point and keeps cost and pages touched.

-- @setup
CREATE TABLE t (id int PRIMARY KEY, k int NOT NULL, k_sorted int NOT NULL, pad text NOT NULL);
INSERT INTO t SELECT i, (i * 7919) % 30000, i - 1, repeat('x', 100) FROM generate_series(1, 30000) AS i ORDER BY i;
CREATE INDEX t_k ON t (k);
CREATE INDEX t_k_sorted ON t (k_sorted);
VACUUM ANALYZE t;
CREATE FUNCTION sweep(col text, ns int[], rpc float8 DEFAULT 4)
RETURNS TABLE (n int, scan text, chosen boolean, cost numeric, pages bigint)
LANGUAGE plpgsql AS $$
DECLARE
  q text;
  j json;
  pick text;
  m text;
BEGIN
  PERFORM set_config('random_page_cost', rpc::text, true);
  FOREACH n IN ARRAY ns LOOP
    q := format('SELECT * FROM t WHERE %I < %s', col, n);
    PERFORM set_config('enable_seqscan', 'on', true);
    PERFORM set_config('enable_bitmapscan', 'on', true);
    PERFORM set_config('enable_indexscan', 'on', true);
    EXECUTE 'EXPLAIN (FORMAT JSON) ' || q INTO j;
    pick := j->0->'Plan'->>'Node Type';
    FOREACH m IN ARRAY ARRAY['seq', 'bitmap', 'index'] LOOP
      PERFORM set_config('enable_seqscan', (m = 'seq')::text, true);
      PERFORM set_config('enable_bitmapscan', (m = 'bitmap')::text, true);
      PERFORM set_config('enable_indexscan', (m = 'index')::text, true);
      EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF, FORMAT JSON) ' || q INTO j;
      scan := j->0->'Plan'->>'Node Type';
      chosen := scan = pick;
      cost := (j->0->'Plan'->>'Total Cost')::numeric;
      pages := (j->0->'Plan'->>'Shared Hit Blocks')::bigint + (j->0->'Plan'->>'Shared Read Blocks')::bigint;
      RETURN NEXT;
    END LOOP;
  END LOOP;
  PERFORM set_config('enable_seqscan', 'on', true);
  PERFORM set_config('enable_bitmapscan', 'on', true);
  PERFORM set_config('enable_indexscan', 'on', true);
END $$;

-- @explain T1 "1 row of 30,000. the index finds it in a few page reads."
SELECT * FROM t WHERE k < 1;
-- @explain T1 "30 rows, 0.1%. a bitmap scan: collect the matching addresses first, then visit each page once, in page order."
SELECT * FROM t WHERE k < 30;
-- @explain T1 "300 rows, 1%. still a bitmap scan. a plain index scan would now cost more than reading the whole table."
SELECT * FROM t WHERE k < 300;
-- @explain T1 "1,500 rows, 5%. the bitmap scan touches most of the table's pages, in order."
SELECT * FROM t WHERE k < 1500;
-- @explain T1 "6,000 rows, 20%. the bitmap scan is still a little cheaper than reading everything."
SELECT * FROM t WHERE k < 6000;
-- @explain T1 "15,000 rows, 50%. a seq scan: read every page once and filter."
SELECT * FROM t WHERE k < 15000;
-- @explain T1 "1 row, on the column stored in table order."
SELECT * FROM t WHERE k_sorted < 1;
-- @explain T1 "30 rows in table order: they sit on one page, side by side."
SELECT * FROM t WHERE k_sorted < 30;
-- @explain T1 "300 rows in table order: a handful of neighbouring pages."
SELECT * FROM t WHERE k_sorted < 300;
-- @explain T1 "1,500 rows in table order."
SELECT * FROM t WHERE k_sorted < 1500;
-- @explain T1 "6,000 rows in table order: the first fifth of the table, read front to back through the index."
SELECT * FROM t WHERE k_sorted < 6000;
-- @explain T1 "15,000 rows in table order."
SELECT * FROM t WHERE k_sorted < 15000;

-- @step T1 "the same 50% query with random_page_cost at 1.1, a common setting for SSDs."
SET random_page_cost = 1.1;
-- @explain T1 "15,000 rows, 50%, at random_page_cost 1.1: now the bitmap scan is the cheaper guess."
SELECT * FROM t WHERE k < 15000;
-- @step T1 "back to the default."
RESET random_page_cost;

-- @step T1 "each scan forced at every point: the planner's cost and the pages it really touched, at random_page_cost 4 and 1.1."
SELECT 'k' AS col, 4 AS rpc, * FROM sweep('k', ARRAY[1, 30, 300, 1500, 6000, 15000])
UNION ALL
SELECT 'k_sorted', 4, * FROM sweep('k_sorted', ARRAY[1, 30, 300, 1500, 6000, 15000])
UNION ALL
SELECT 'k', 1.1, * FROM sweep('k', ARRAY[1, 30, 300, 1500, 6000, 15000], 1.1)
UNION ALL
SELECT 'k_sorted', 1.1, * FROM sweep('k_sorted', ARRAY[1, 30, 300, 1500, 6000, 15000], 1.1);

-- @step T1 "the 30 rows with k < 30, in index order (the order an index scan visits them), with the heap page each one lives on."
SELECT k, (ctid::text::point)[0]::int AS page FROM t WHERE k < 30 ORDER BY k;

-- @step T1 "how many pages the table has."
SELECT pg_relation_size('t') / 8192 AS pages;

-- @step T1 "the seq scan's cost, rebuilt from pg_class and the cost settings: pages at seq_page_cost, rows at cpu_tuple_cost, one comparison per row at cpu_operator_cost."
SELECT relpages AS pages, reltuples::int AS rows,
       relpages * current_setting('seq_page_cost')::numeric AS page_cost,
       reltuples::int * current_setting('cpu_tuple_cost')::numeric AS row_cost,
       reltuples::int * current_setting('cpu_operator_cost')::numeric AS filter_cost,
       relpages * current_setting('seq_page_cost')::numeric
         + reltuples::int * (current_setting('cpu_tuple_cost')::numeric + current_setting('cpu_operator_cost')::numeric) AS total
FROM pg_class WHERE relname = 't';
