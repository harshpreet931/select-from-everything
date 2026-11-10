-- @title the paris query, as text EXPLAIN and as json, for reading a plan bottom-up
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "the plan alone: the planner's guesses, nothing run."
EXPLAIN
SELECT c.name, count(*) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris'
GROUP BY c.id
ORDER BY orders DESC, c.id
LIMIT 5;

-- @step T1 "the same plan, run: estimates and actual rows on every line."
EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF, SUMMARY OFF)
SELECT c.name, count(*) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris'
GROUP BY c.id
ORDER BY orders DESC, c.id
LIMIT 5;

-- @explain T1 "the same plan as json, for the tree."
SELECT c.name, count(*) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris'
GROUP BY c.id
ORDER BY orders DESC, c.id
LIMIT 5;

-- @step T1 "what the seq scan on customers costs, worked out from the catalog and the cost settings."
SELECT relpages, reltuples,
       relpages * current_setting('seq_page_cost')::float8 AS page_cost,
       reltuples * current_setting('cpu_tuple_cost')::float8 AS row_cost,
       reltuples * current_setting('cpu_operator_cost')::float8 AS filter_cost
FROM pg_class
WHERE relname = 'customers';
