-- @title paris customers and their orders, joined four ways by a nested loop, and a Memoize cache
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "four customers, the outer side of the small join."
SELECT id, name FROM customers WHERE id <= 4 ORDER BY id;

-- @step T1 "six of their orders and one of customer 6, the inner side."
SELECT id, customer_id FROM orders
WHERE id IN (1, 47, 511, 529, 566, 716) OR id = (SELECT min(id) FROM orders WHERE customer_id = 6)
ORDER BY id;

-- @step T1 "hash and merge joins off, and no index either: every order is compared with the 66 paris customers, kept in memory by a Materialize, until it finds its own."
SET enable_hashjoin = off;
SET enable_mergejoin = off;
SET enable_memoize = off;
SET enable_indexscan = off;
SET enable_bitmapscan = off;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT c.name, o.id FROM customers AS c JOIN orders AS o ON o.customer_id = c.id WHERE c.city = 'Paris';

-- @step T1 "indexes back on: each order is one lookup in customers_pkey, 10,000 of them."
RESET enable_indexscan;
RESET enable_bitmapscan;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT c.name, o.id FROM customers AS c JOIN orders AS o ON o.customer_id = c.id WHERE c.city = 'Paris';

-- @step T1 "Memoize back on: a customer looked up once is remembered, so a repeat costs no lookup at all."
RESET enable_memoize;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT c.name, o.id FROM customers AS c JOIN orders AS o ON o.customer_id = c.id WHERE c.city = 'Paris';

-- @step T1 "the same with 64kB for the cache: it fills up, throws old customers out, and has to look some of them up again."
SET work_mem = '64kB';
SET hash_mem_multiplier = 1;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT c.name, o.id FROM customers AS c JOIN orders AS o ON o.customer_id = c.id WHERE c.city = 'Paris';

-- @step T1 "nothing switched off: the first 1,000 orders with their customers, which postgres runs as a nested loop with Memoize on its own."
RESET ALL;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT o.id, c.name FROM orders AS o JOIN customers AS c ON c.id = o.customer_id ORDER BY o.id LIMIT 1000;

-- @step T1 "the cache keys that plan saw, in order: the customer_id of each of the first 1,000 orders."
SELECT customer_id FROM orders ORDER BY id LIMIT 1000;
