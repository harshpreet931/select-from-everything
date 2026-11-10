-- @title Ada's purchases, one join at a time
-- @engine pglite
-- @db shop
-- @each

-- the stepper on inner-join reads these: customer 42 alone, then joined to orders, order_items
-- and products in turn. each step is a real query, narrowed to a few columns so it fits.

-- @step T1 "customers, narrowed to one row: Ada Lovelace, customer 42."
SELECT c.id, c.name
FROM customers AS c
WHERE c.id = 42;

-- @step T1 "join orders: one row per order of hers. Ada's row is repeated 7 times, once for each."
SELECT c.name, o.id AS order_id, o.status
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.id = 42
ORDER BY o.id;

-- @step T1 "join order_items: one row per line of those orders. 7 orders had 18 lines between them."
SELECT c.name, o.id AS order_id, oi.line_no, oi.product_id, oi.qty
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
JOIN order_items AS oi ON oi.order_id = o.id
WHERE c.id = 42
ORDER BY o.id, oi.line_no;

-- @step T1 "join products: each line finds its one product, so still 18 rows, now with names."
SELECT c.name, o.id AS order_id, oi.line_no, p.name AS product, oi.qty
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
JOIN order_items AS oi ON oi.order_id = o.id
JOIN products AS p ON p.id = oi.product_id
WHERE c.id = 42
ORDER BY o.id, oi.line_no;
