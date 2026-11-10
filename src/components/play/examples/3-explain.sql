-- @label explain
-- @db shop
-- how postgres plans to find one customer's orders. there's no index on customer_id yet.
EXPLAIN SELECT o.id, o.status
FROM orders AS o
WHERE o.customer_id = 42;

CREATE INDEX orders_customer_id_idx ON orders (customer_id);

-- same question, now with an index to use
EXPLAIN SELECT o.id, o.status
FROM orders AS o
WHERE o.customer_id = 42;
