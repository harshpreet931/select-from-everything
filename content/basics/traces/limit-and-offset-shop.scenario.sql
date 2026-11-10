-- @title OFFSET on the shop's orders: what a deep page costs, and pages that shift under you
-- @engine pglite
-- @db shop
-- @each

-- @explain T1 "page 1"
SELECT id, customer_id, status FROM orders ORDER BY id LIMIT 10 OFFSET 0;
-- @explain T1 "page 11"
SELECT id, customer_id, status FROM orders ORDER BY id LIMIT 10 OFFSET 100;
-- @explain T1 "page 101"
SELECT id, customer_id, status FROM orders ORDER BY id LIMIT 10 OFFSET 1000;
-- @explain T1 "page 501"
SELECT id, customer_id, status FROM orders ORDER BY id LIMIT 10 OFFSET 5000;
-- @explain T1 "the last page"
SELECT id, customer_id, status FROM orders ORDER BY id LIMIT 10 OFFSET 9990;
-- @explain T1 "the last page, by keyset"
SELECT id, customer_id, status FROM orders WHERE id > 9990 ORDER BY id LIMIT 10;

-- @step T1 "page 1 of the newest orders, five to a page."
SELECT id, customer_id, status, ordered_at
FROM orders
ORDER BY ordered_at DESC, id DESC
LIMIT 5;

-- @step T1 "while you read page 1, Ada places an order. page 2 is OFFSET 5, and every row has moved down one: its first row is the last row of page 1, again."
INSERT INTO orders (customer_id, status, ordered_at) VALUES (42, 'placed', '2026-06-28 09:00:00+00');
SELECT id, customer_id, status, ordered_at
FROM orders
ORDER BY ordered_at DESC, id DESC
LIMIT 5 OFFSET 5;
