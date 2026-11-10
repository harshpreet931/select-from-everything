-- @title fan-out in the shop: an order total, summed before and after joining the order lines
-- @engine pglite
-- @db shop
-- @each

-- the stepper and the switch on fan-out read these. real shops keep each order's total on the
-- order. the shop dataset doesn't, so the setup adds one, computed from the order lines, the same
-- way the chapter's first block does.

-- @setup
ALTER TABLE orders ADD COLUMN total numeric(10,2);
UPDATE orders AS o SET total = (SELECT sum(oi.qty * oi.unit_price) FROM order_items AS oi WHERE oi.order_id = o.id);

-- @step T1 "Ada's 7 orders, one row each, with the total stored on the order. they add up to 3,033.13."
SELECT o.id AS order_id, o.status, o.total
FROM orders AS o
WHERE o.customer_id = 42
ORDER BY o.id;

-- @step T1 "join the order lines: one row per line. each order's total now appears once per line, so order 880, with 3 lines, is in the sum 3 times."
SELECT o.id AS order_id, o.total, oi.line_no, oi.qty
FROM orders AS o
JOIN order_items AS oi ON oi.order_id = o.id
WHERE o.customer_id = 42
ORDER BY o.id, oi.line_no;

-- @step T1 "aggregate the lines first, one row per order, then join. every order is one row again, and the totals add up."
SELECT o.id AS order_id, o.total, li.items
FROM orders AS o
JOIN (SELECT order_id, sum(qty) AS items FROM order_items GROUP BY order_id) AS li ON li.order_id = o.id
WHERE o.customer_id = 42
ORDER BY o.id;

-- @step T1 "the right sum: the orders alone."
SELECT sum(o.total) FROM orders AS o WHERE o.customer_id = 42;

-- @step T1 "the wrong sum: the same orders, after the join to their lines."
SELECT sum(o.total) FROM orders AS o JOIN order_items AS oi ON oi.order_id = o.id WHERE o.customer_id = 42;

-- @step T1 "the sum after aggregating first."
SELECT sum(o.total) FROM orders AS o JOIN (SELECT order_id, sum(qty) AS items FROM order_items GROUP BY order_id) AS li ON li.order_id = o.id WHERE o.customer_id = 42;

-- @step T1 "one join, three columns from the products side, one from order_items. the counts are line counts, the averages are weighted by sales, and only units is right."
SELECT p.category, count(p.id) AS products, round(avg(p.price), 2) AS avg_price, sum(oi.qty) AS units
FROM products AS p
JOIN order_items AS oi ON oi.product_id = p.id
GROUP BY p.category
ORDER BY p.category NULLS FIRST;

-- @step T1 "aggregate order_items to one row per product first, then join: products count products again, and the average is over the catalogue. kitchen has 19 products, not 4,518."
SELECT p.category, count(*) AS products, round(avg(p.price), 2) AS avg_price, sum(s.units) AS units
FROM products AS p
LEFT JOIN (SELECT product_id, sum(qty) AS units FROM order_items GROUP BY product_id) AS s ON s.product_id = p.id
GROUP BY p.category
ORDER BY p.category NULLS FIRST;
