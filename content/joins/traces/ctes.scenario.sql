-- @title one CTE, inlined and materialized, and one used twice
-- @engine pglite
-- @db shop
-- @each

-- the plans on ctes read these. EXPLAIN ANALYZE, so the row counts are what really happened.

-- @explain T1 "referenced once, no keyword: the CTE is inlined, and WHERE id = 42 reaches the index."
WITH c AS (SELECT * FROM customers)
SELECT name, city FROM c WHERE id = 42;

-- @explain T1 "MATERIALIZED: the CTE runs first, all 2,000 customers into a temporary result, then the filter reads it."
WITH c AS MATERIALIZED (SELECT * FROM customers)
SELECT name, city FROM c WHERE id = 42;

-- @explain T1 "referenced twice: postgres materializes it by default, computes it once, and scans the result twice."
WITH per_customer AS (
  SELECT customer_id, count(*) AS n FROM orders GROUP BY customer_id
)
SELECT count(*) FROM per_customer
WHERE n > (SELECT avg(n) FROM per_customer);

-- @explain T1 "NOT MATERIALIZED, referenced twice: inlined in both places, so orders is grouped twice."
WITH per_customer AS NOT MATERIALIZED (
  SELECT customer_id, count(*) AS n FROM orders GROUP BY customer_id
)
SELECT count(*) FROM per_customer
WHERE n > (SELECT avg(n) FROM per_customer);
