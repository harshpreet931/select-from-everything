-- @title a lookup that needs one more column than the index has, then the same with INCLUDE
-- @engine pglite
-- @db shop
-- @each

-- index-only-scans reads this file. orders is vacuumed when the dataset loads, so its pages are
-- all-visible from the start: only the index decides whether the heap is needed.

-- @setup
CREATE INDEX orders_customer ON orders (customer_id);

-- @explain T1 "the index has customer_id but not status, so every match is a visit to the heap: a bitmap scan over the orders' pages."
SELECT customer_id, status FROM orders WHERE customer_id = 42;

-- @step T1 "the same key, with status carried along in each entry."
DROP INDEX orders_customer;
CREATE INDEX orders_customer_inc ON orders (customer_id) INCLUDE (status);

-- @explain T1 "now the index has both columns: an index-only scan, and the heap stays shut."
SELECT customer_id, status FROM orders WHERE customer_id = 42;

-- @explain T1 "an INCLUDE column is payload, not key: it can't narrow the search, so a lookup by status alone doesn't use the index."
SELECT customer_id, status FROM orders WHERE status = 'placed';
