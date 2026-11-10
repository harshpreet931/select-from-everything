-- @title one query, three scans, priced under different cost settings
-- @engine pglite
-- @db shop
-- @each

-- cost-model reads this file. orders gets an index on customer_id (the dataset has no secondary
-- indexes). step 0 is what the hand-priced scans read from the catalog, step 1 the settings, steps 2 and 4 the two
-- index scans priced by hand, and the last step forces each of the three scans for
-- customer_id <= 500 under every combination of random_page_cost, seq_page_cost and
-- cpu_tuple_cost in the figure, keeping the estimated total cost and which one the planner picked.

-- @setup
CREATE INDEX orders_customer_id ON orders (customer_id);
ANALYZE orders;
CREATE FUNCTION dial(q text, rpc float8, spc float8, ctc float8)
RETURNS TABLE (scan text, cost numeric, est_rows bigint, chosen boolean)
LANGUAGE plpgsql AS $$
DECLARE
  j json;
  pick text;
  m text;
BEGIN
  PERFORM set_config('random_page_cost', rpc::text, true);
  PERFORM set_config('seq_page_cost', spc::text, true);
  PERFORM set_config('cpu_tuple_cost', ctc::text, true);
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || q INTO j;
  pick := j->0->'Plan'->>'Node Type';
  FOREACH m IN ARRAY ARRAY['seq', 'bitmap', 'index'] LOOP
    PERFORM set_config('enable_seqscan', (m = 'seq')::text, true);
    PERFORM set_config('enable_bitmapscan', (m = 'bitmap')::text, true);
    PERFORM set_config('enable_indexscan', (m = 'index')::text, true);
    EXECUTE 'EXPLAIN (FORMAT JSON) ' || q INTO j;
    scan := j->0->'Plan'->>'Node Type';
    cost := (j->0->'Plan'->>'Total Cost')::numeric;
    est_rows := (j->0->'Plan'->>'Plan Rows')::bigint;
    chosen := scan = pick;
    RETURN NEXT;
  END LOOP;
  PERFORM set_config('enable_seqscan', 'on', true);
  PERFORM set_config('enable_bitmapscan', 'on', true);
  PERFORM set_config('enable_indexscan', 'on', true);
  PERFORM set_config('random_page_cost', '4', true);
  PERFORM set_config('seq_page_cost', '1', true);
  PERFORM set_config('cpu_tuple_cost', '0.01', true);
END $$;

-- @step T1 "what the hand-priced scans read: pages and rows from pg_class, the tree height from the btree's meta page, the column's correlation from pg_stats."
SELECT c.relname, c.relpages, c.reltuples::int AS reltuples,
       CASE WHEN c.relkind = 'i' THEN (SELECT level FROM bt_metap(c.relname)) END AS height,
       (SELECT correlation FROM pg_stats WHERE tablename = 'orders' AND attname = 'customer_id') AS corr
FROM pg_class AS c
WHERE c.relname IN ('orders', 'orders_pkey', 'orders_customer_id')
ORDER BY c.relname;

-- @step T1 "the cost settings, all at their defaults."
SELECT name, setting FROM pg_settings
WHERE name IN ('seq_page_cost', 'random_page_cost', 'cpu_tuple_cost', 'cpu_index_tuple_cost', 'cpu_operator_cost', 'effective_cache_size')
ORDER BY name;

-- @explain T1 noanalyze "one order by its primary key: descend the index, fetch one heap page."
SELECT * FROM orders WHERE id = 42;

-- @step T1 "take the other two scans away, so the plain index scan's price shows."
SET enable_seqscan = off;
SET enable_bitmapscan = off;

-- @explain T1 noanalyze "the index scan for customer_id <= 500, forced: 3,959 index entries, each pointing at a heap page."
SELECT * FROM orders WHERE customer_id <= 500;

-- @step T1 "back to the defaults."
RESET enable_seqscan;
RESET enable_bitmapscan;

-- @step T1 "every scan, under every setting in the figure."
SELECT rpc, spc, ctc, d.scan, d.cost, d.est_rows, d.chosen
FROM unnest(ARRAY[1, 1.1, 2, 4, 8]::float8[]) AS rpc,
     unnest(ARRAY[0.5, 1, 2]::float8[]) AS spc,
     unnest(ARRAY[0.005, 0.01, 0.02, 0.04]::float8[]) AS ctc,
     LATERAL dial('SELECT * FROM orders WHERE customer_id <= 500', rpc, spc, ctc) AS d
ORDER BY rpc, spc, ctc, d.scan;
