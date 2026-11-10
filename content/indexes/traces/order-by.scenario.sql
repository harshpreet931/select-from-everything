-- @title the newest orders with and without an index, NULLs at either end, and a half-matching index
-- @engine pglite
-- @db shop
-- @each

-- indexes-and-order-by reads this file. orders has no secondary indexes until the steps make them.

-- @explain T1 "no index on ordered_at: read all 10,000 orders and keep the newest 10 in a top-N heapsort."
SELECT id, customer_id, ordered_at FROM orders ORDER BY ordered_at DESC LIMIT 10;

-- @step T1 "an index on ordered_at."
CREATE INDEX orders_ordered_at ON orders (ordered_at);

-- @explain T1 "the index is already in order: read it backwards from the newest entry and stop after 10. no sort node."
SELECT id, customer_id, ordered_at FROM orders ORDER BY ordered_at DESC LIMIT 10;

-- @step T1 "an index on shipped_at, which is NULL for the 430 orders that haven't shipped."
CREATE INDEX orders_shipped_at ON orders (shipped_at);

-- @explain T1 "ASC NULLS LAST: the index's own order. read it forwards."
SELECT id, shipped_at FROM orders ORDER BY shipped_at LIMIT 5;
-- @explain T1 "DESC NULLS FIRST: the exact reverse. read it backwards, and the unshipped orders come first."
SELECT id, shipped_at FROM orders ORDER BY shipped_at DESC LIMIT 5;
-- @explain T1 "DESC NULLS LAST: neither direction of the index gives this order, so postgres sorts."
SELECT id, shipped_at FROM orders ORDER BY shipped_at DESC NULLS LAST LIMIT 5;
-- @explain T1 "ASC NULLS FIRST: same problem the other way round."
SELECT id, shipped_at FROM orders ORDER BY shipped_at NULLS FIRST LIMIT 5;

-- @step T1 "DESC sorts NULLs first by default: the five 'latest shipped' orders haven't shipped."
SELECT id, shipped_at FROM orders ORDER BY shipped_at DESC, id LIMIT 5;

-- @step T1 "an index on customer_id only."
CREATE INDEX orders_customer ON orders (customer_id);

-- @explain T1 "the index gives customer_id order; postgres sorts within each customer as the rows come (incremental sort), and stops after 10."
SELECT id, customer_id, ordered_at FROM orders ORDER BY customer_id, ordered_at DESC LIMIT 10;
