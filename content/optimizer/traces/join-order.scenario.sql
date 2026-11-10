-- @title one four-table join, planned freely and in the order written, and the genetic optimizer on a 14-table chain
-- @engine pglite
-- @db shop
-- @each

-- join-ordering reads this file. step 0 is how fast the number of join orders grows; then the
-- shop join under join_collapse_limit 8 and 1, written with JOIN and with commas (a SET step, the
-- query, its plan); the last step plans chains of 10 to 14 small tables with geqo on and off.

-- @setup
DO $$
BEGIN
  FOR i IN 1..14 LOOP
    EXECUTE format('CREATE TABLE t%s (id int PRIMARY KEY, next_id int, v int)', i);
    EXECUTE format('INSERT INTO t%s SELECT g, (g * 7) %% %s + 1, g %% (%s + 2) FROM generate_series(1, %s) AS g ORDER BY g', i, 100 * (15 - i), i, 100 * i);
    EXECUTE format('ANALYZE t%s', i);
  END LOOP;
END $$;
CREATE FUNCTION chain(n int) RETURNS text LANGUAGE sql AS $$
  SELECT 'SELECT count(*) FROM t1' || string_agg(format(' JOIN t%s ON t%s.id = t%s.next_id AND t%s.v < %s', i, i, i - 1, i, i % 4 + 1), '' ORDER BY i)
  FROM generate_series(2, n) AS i
$$;
CREATE FUNCTION plan_cost(q text) RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE j json;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || q INTO j;
  RETURN (j->0->'Plan'->>'Total Cost')::numeric;
END $$;

-- @step T1 "n tables: n! left-deep join orders, and 2^n - 1 sets of tables for the planner's dynamic programming to cost."
SELECT n, factorial(n) AS orders, (2 ^ n)::bigint - 1 AS subsets
FROM generate_series(2, 14) AS n
ORDER BY n;

-- @step T1 "join_collapse_limit = 8."
SET join_collapse_limit = 8;

-- @step T1 "join_collapse_limit 8, the default: the planner flattens the four JOINs and searches every order. it starts from customer 42."
SELECT p.name, oi.qty
FROM products AS p
JOIN order_items AS oi ON oi.product_id = p.id
JOIN orders AS o ON o.id = oi.order_id
JOIN customers AS c ON c.id = o.customer_id
WHERE c.id = 42
ORDER BY p.name, oi.qty;

-- @explain T1 noanalyze "8, JOIN."
SELECT p.name, oi.qty
FROM products AS p
JOIN order_items AS oi ON oi.product_id = p.id
JOIN orders AS o ON o.id = oi.order_id
JOIN customers AS c ON c.id = o.customer_id
WHERE c.id = 42
ORDER BY p.name, oi.qty;

-- @step T1 "join_collapse_limit = 8."
SET join_collapse_limit = 8;

-- @step T1 "a comma-separated FROM list is governed by from_collapse_limit, not join_collapse_limit. the same plan as the default."
SELECT p.name, oi.qty
FROM products AS p, order_items AS oi, orders AS o, customers AS c
WHERE oi.product_id = p.id AND o.id = oi.order_id AND c.id = o.customer_id
  AND c.id = 42
ORDER BY p.name, oi.qty;

-- @explain T1 noanalyze "8, commas."
SELECT p.name, oi.qty
FROM products AS p, order_items AS oi, orders AS o, customers AS c
WHERE oi.product_id = p.id AND o.id = oi.order_id AND c.id = o.customer_id
  AND c.id = 42
ORDER BY p.name, oi.qty;

-- @step T1 "join_collapse_limit = 1."
SET join_collapse_limit = 1;

-- @step T1 "join_collapse_limit 1: the JOINs are joined in the order written. products with all 24,942 order items first, then orders, then the customer."
SELECT p.name, oi.qty
FROM products AS p
JOIN order_items AS oi ON oi.product_id = p.id
JOIN orders AS o ON o.id = oi.order_id
JOIN customers AS c ON c.id = o.customer_id
WHERE c.id = 42
ORDER BY p.name, oi.qty;

-- @explain T1 noanalyze "1, JOIN."
SELECT p.name, oi.qty
FROM products AS p
JOIN order_items AS oi ON oi.product_id = p.id
JOIN orders AS o ON o.id = oi.order_id
JOIN customers AS c ON c.id = o.customer_id
WHERE c.id = 42
ORDER BY p.name, oi.qty;

-- @step T1 "join_collapse_limit = 1."
SET join_collapse_limit = 1;

-- @step T1 "join_collapse_limit 1 doesn't touch a comma list: still the cheap plan."
SELECT p.name, oi.qty
FROM products AS p, order_items AS oi, orders AS o, customers AS c
WHERE oi.product_id = p.id AND o.id = oi.order_id AND c.id = o.customer_id
  AND c.id = 42
ORDER BY p.name, oi.qty;

-- @explain T1 noanalyze "1, commas."
SELECT p.name, oi.qty
FROM products AS p, order_items AS oi, orders AS o, customers AS c
WHERE oi.product_id = p.id AND o.id = oi.order_id AND c.id = o.customer_id
  AND c.id = 42
ORDER BY p.name, oi.qty;

-- @step T1 "back to the default."
RESET join_collapse_limit;

-- @step T1 "chains of 10 to 14 tables, with join_collapse_limit raised so nothing is split: the cheapest plan the genetic optimizer found (geqo_threshold is 12)."
SET join_collapse_limit = 20;
SELECT n, plan_cost(chain(n)) AS cost FROM generate_series(10, 14) AS n ORDER BY n;

-- @step T1 "the same chains with geqo off: the exhaustive search's cheapest plan."
SET geqo = off;
SELECT n, plan_cost(chain(n)) AS cost FROM generate_series(10, 14) AS n ORDER BY n;
