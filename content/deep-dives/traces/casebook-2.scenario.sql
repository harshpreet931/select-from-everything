-- @title tuning casebook, cases 6 to 10: shop queries before and after their one change
-- @engine pglite
-- @db shop
-- @each

-- @explain T1 "case 6, before: page 451 of 20 orders with OFFSET. the index scan reads the 9,000 rows it skips."
SELECT id, status FROM orders ORDER BY id OFFSET 9000 LIMIT 20;

-- @explain T1 "case 6, after: keyset. start after the last id of the previous page, and read 20 rows."
SELECT id, status FROM orders WHERE id > 9000 ORDER BY id LIMIT 20;

-- @step T1 "case 7, setup: a small work_mem, as if orders were too big for the hashed subplan."
SET work_mem = '64kB';

-- @explain T1 "case 7, before: NOT IN can't become an anti join (NULLs), and its hash doesn't fit, so the subquery's rows are rescanned for every customer."
SELECT count(*) FROM customers WHERE id NOT IN (SELECT customer_id FROM orders);

-- @explain T1 "case 7, after: NOT EXISTS becomes a hash anti join, in batches, one pass each."
SELECT count(*) FROM customers AS c WHERE NOT EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.id);

-- @step T1 "case 8, setup: still 64kB of work_mem."
SET work_mem = '64kB';

-- @explain T1 "case 8, before: the sort doesn't fit in work_mem, so it spills to disk and merges."
SELECT order_id, line_no, unit_price FROM order_items ORDER BY unit_price DESC, order_id, line_no;

-- @step T1 "case 8, the change: more work_mem for this one query."
SET work_mem = '8MB';

-- @explain T1 "case 8, after: the whole sort fits in memory."
SELECT order_id, line_no, unit_price FROM order_items ORDER BY unit_price DESC, order_id, line_no;

-- @step T1 "case 9, setup: back to the default work_mem."
RESET work_mem;

-- @explain T1 "case 9, before: deleting a customer fires the foreign key's check on orders, and this is the query it runs. without an index on orders.customer_id it's a seq scan, once per deleted row."
SELECT 1 FROM ONLY orders AS x WHERE customer_id = 7 FOR KEY SHARE OF x;

-- @step T1 "case 9, the change: an index on the referencing column."
CREATE INDEX orders_customer_id ON orders (customer_id);

-- @explain T1 "case 9, after: the same check is an index scan."
SELECT 1 FROM ONLY orders AS x WHERE customer_id = 7 FOR KEY SHARE OF x;

-- @explain T1 "case 10, before: the OR spans two tables, so no index can answer it. both tables are read in full and joined, then filtered."
SELECT o.id FROM orders AS o JOIN customers AS c ON c.id = o.customer_id
WHERE c.email = 'ada@example.com' OR o.id = 5000;

-- @explain T1 "case 10, after: split the OR into a UNION of two queries, each of which can use an index."
SELECT o.id FROM orders AS o JOIN customers AS c ON c.id = o.customer_id WHERE c.email = 'ada@example.com'
UNION
SELECT o.id FROM orders AS o WHERE o.id = 5000;
