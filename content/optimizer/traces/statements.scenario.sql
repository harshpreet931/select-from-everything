-- @title an orders page loaded two ways, seen from pg_stat_statements on a real server
-- @db shop
-- @ext pg_stat_statements
-- @server shared_preload_libraries=pg_stat_statements pg_stat_statements.track=all
-- @each

-- finding-slow-queries reads this file. pg_stat_statements needs shared_preload_libraries, so
-- this runs on a native postgres 18.6, not in the browser. the "app" is a DO block, so that one
-- step sends what an ORM would send as 101 statements; track = all records the statements inside
-- it. step 3 is pg_stat_statements after the N+1 version, step 5 after the one-query version.
-- timing columns are left out: they change on every run.

-- @step T1 "start counting from zero."
SELECT pg_stat_statements_reset() IS NOT NULL AS reset;

-- @step T1 "the N+1 version: one query for the 100 latest orders, then one query per order for its items."
DO $$
DECLARE
  r record;
  n bigint;
BEGIN
  FOR r IN SELECT id FROM orders ORDER BY ordered_at DESC, id LIMIT 100 LOOP
    SELECT sum(qty) INTO n FROM order_items WHERE order_id = r.id;
  END LOOP;
END $$;

-- @step T1 "the one-query version: the same 100 orders and their item counts, in one statement."
SELECT o.id, sum(oi.qty) AS items
FROM (SELECT id FROM orders ORDER BY ordered_at DESC, id LIMIT 100) AS o
LEFT JOIN order_items AS oi ON oi.order_id = o.id
GROUP BY o.id
ORDER BY o.id;

-- @step T1 "what pg_stat_statements saw: one row per normalized statement, with calls and rows."
SELECT calls, rows, shared_blks_hit + shared_blks_read AS pages,
       regexp_replace(query, '\s+', ' ', 'g') AS query
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat_statements%'
ORDER BY calls DESC, query;
