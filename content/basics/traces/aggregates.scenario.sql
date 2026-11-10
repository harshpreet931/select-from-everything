-- @title aggregates over Ada's seven orders, and over nothing at all
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "Ada's seven orders. two have no shipped_at: one was cancelled, one is still waiting to ship."
SELECT id, status, shipped_at
FROM orders
WHERE customer_id = 42
ORDER BY id;

-- @step T1 "the three counts, in one query."
SELECT count(*), count(shipped_at), count(DISTINCT status)
FROM orders
WHERE customer_id = 42;

-- @step T1 "how many hours each of Ada's orders took to ship. NULL where it never shipped."
SELECT id, status, (extract(epoch FROM shipped_at - ordered_at) / 3600)::int AS hours
FROM orders
WHERE customer_id = 42
ORDER BY id;

-- @step T1 "the average of those hours, and what it was made of."
SELECT count(*) AS rows,
       count(shipped_at) AS shipped,
       round(avg(extract(epoch FROM shipped_at - ordered_at) / 3600), 2) AS avg_hours
FROM orders
WHERE customer_id = 42;

-- @step T1 "six aggregates on three inputs: some values with a NULL among them, nothing but NULLs, and no rows at all."
WITH vals (x) AS (VALUES (1), (NULL::int), (3)),
     nulls (x) AS (VALUES (NULL::int), (NULL)),
     none (x) AS (SELECT 1 WHERE false)
SELECT agg AS aggregate, a AS "1, NULL, 3", b AS "NULL, NULL", c AS "no rows" FROM (
  SELECT 1, 'count(*)', (SELECT count(*) FROM vals)::text, (SELECT count(*) FROM nulls)::text, (SELECT count(*) FROM none)::text
  UNION ALL SELECT 2, 'count(x)', (SELECT count(x) FROM vals)::text, (SELECT count(x) FROM nulls)::text, (SELECT count(x) FROM none)::text
  UNION ALL SELECT 3, 'sum(x)', (SELECT sum(x) FROM vals)::text, (SELECT sum(x) FROM nulls)::text, (SELECT sum(x) FROM none)::text
  UNION ALL SELECT 4, 'avg(x)', (SELECT avg(x) FROM vals)::text, (SELECT avg(x) FROM nulls)::text, (SELECT avg(x) FROM none)::text
  UNION ALL SELECT 5, 'min(x)', (SELECT min(x) FROM vals)::text, (SELECT min(x) FROM nulls)::text, (SELECT min(x) FROM none)::text
  UNION ALL SELECT 6, 'max(x)', (SELECT max(x) FROM vals)::text, (SELECT max(x) FROM nulls)::text, (SELECT max(x) FROM none)::text
) AS t (n, agg, a, b, c)
ORDER BY n;
