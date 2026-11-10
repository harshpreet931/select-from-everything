-- @title hash joins on shop: which side gets hashed, and a build side that stops fitting in memory
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "eight orders: the probe side of the small join."
SELECT id, customer_id FROM orders WHERE id IN (1, 12, 47, 92, 511, 529, 566, 1596) ORDER BY id;

-- @step T1 "five customers: the build side."
SELECT id, name FROM customers WHERE id <= 5 ORDER BY id;

-- @step T1 "orders first in FROM: postgres hashes customers, the smaller side, and streams orders past it."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT o.id, c.name FROM orders AS o JOIN customers AS c ON c.id = o.customer_id;

-- @step T1 "customers first in FROM: the same plan. the order you write the tables in doesn't pick the build side."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT o.id, c.name FROM customers AS c JOIN orders AS o ON o.customer_id = c.id;

-- @step T1 "the default work_mem, 4MB, times hash_mem_multiplier 2: all 10,000 orders fit in one hash table."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT o.customer_id, o.status, o.ordered_at, o.shipped_at, oi.product_id, oi.qty
FROM order_items AS oi JOIN orders AS o ON o.id = oi.order_id;

-- @step T1 "256kB, so 512kB for the hash table: postgres splits both sides into 2 batches and keeps one in memory."
SET work_mem = '256kB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT o.customer_id, o.status, o.ordered_at, o.shipped_at, oi.product_id, oi.qty
FROM order_items AS oi JOIN orders AS o ON o.id = oi.order_id;

-- @step T1 "128kB: 4 batches. three quarters of both sides go to temp files and come back later."
SET work_mem = '128kB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT o.customer_id, o.status, o.ordered_at, o.shipped_at, oi.product_id, oi.qty
FROM order_items AS oi JOIN orders AS o ON o.id = oi.order_id;

-- @step T1 "64kB, the minimum: 8 batches, and the most temp file traffic."
SET work_mem = '64kB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT o.customer_id, o.status, o.ordered_at, o.shipped_at, oi.product_id, oi.qty
FROM order_items AS oi JOIN orders AS o ON o.id = oi.order_id;
