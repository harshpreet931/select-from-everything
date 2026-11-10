-- @title merge joins on shop: sorted inputs from indexes or from Sorts, and rewinds over duplicate keys
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "five customers, for the small join."
SELECT id, name FROM customers WHERE id <= 5 ORDER BY id;

-- @step T1 "eight orders, some customers twice, one customer not in the list."
SELECT id, customer_id FROM orders WHERE id IN (1, 12, 47, 92, 511, 529, 566, 1596) ORDER BY id;

-- @step T1 "orders and their items, in order id order. both primary keys hand rows over sorted on order_id: a merge join with no sorting at all."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT o.id, o.status, oi.line_no, oi.qty
FROM orders AS o JOIN order_items AS oi ON oi.order_id = o.id
ORDER BY o.id;

-- @step T1 "customers and their orders, by customer. nothing hands orders over sorted by customer_id, so postgres hashes, then sorts all 10,000 rows for the ORDER BY."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT c.id, c.name, o.id
FROM customers AS c JOIN orders AS o ON o.customer_id = c.id
ORDER BY c.id;

-- @step T1 "orders joined to itself on customer_id, merge forced. the inner Sort hands over more rows than it holds: every run of duplicate keys is read again."
SET enable_hashjoin = off;
SET enable_nestloop = off;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT a.id, b.id FROM orders AS a JOIN orders AS b ON a.customer_id = b.customer_id;

-- @step T1 "order lines and products, merge forced: both sides sorted first. the products side stops at 199 of 200 rows, because no order line wants product 200."
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT p.name, oi.qty FROM order_items AS oi JOIN products AS p ON p.id = oi.product_id;

-- @step T1 "with an index on orders.customer_id, the by-customer join needs no Sort and no hash: two index scans, merged."
RESET ALL;
CREATE INDEX ON orders (customer_id);
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT c.id, c.name, o.id
FROM customers AS c JOIN orders AS o ON o.customer_id = c.id
ORDER BY c.id;

-- @step T1 "the self-join again, now over the index. an index scan can step back, but each step back fetches the rows again, so a Materialize keeps the current run in memory instead."
SET enable_hashjoin = off;
SET enable_nestloop = off;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT a.id, b.id FROM orders AS a JOIN orders AS b ON a.customer_id = b.customer_id;
