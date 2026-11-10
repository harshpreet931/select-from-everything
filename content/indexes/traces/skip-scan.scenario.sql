-- @title b = 5 on an index on (a, b): with 4 values of a, and with 3,000
-- @engine pglite
-- @db shop
-- @each

-- skip-scan reads this file. few and many have the same 30,000 rows of (a, b, pad); only the
-- number of distinct values of a differs. then a real one: shop's orders, an index on
-- (status, customer_id), and a lookup by customer alone.

-- @setup
CREATE TABLE few (a int NOT NULL, b int NOT NULL, pad text NOT NULL);
INSERT INTO few SELECT i % 4, i / 4, repeat('x', 40) FROM generate_series(0, 29999) AS i ORDER BY i;
CREATE INDEX few_a_b ON few (a, b);
CREATE TABLE many (a int NOT NULL, b int NOT NULL, pad text NOT NULL);
INSERT INTO many SELECT i % 3000, i / 3000, repeat('x', 40) FROM generate_series(0, 29999) AS i ORDER BY i;
CREATE INDEX many_a_b ON many (a, b);
VACUUM ANALYZE few, many;
CREATE INDEX orders_status_customer ON orders (status, customer_id);

-- @explain T1 "4 values of a: postgres hops. one search for each value of a, plus one."
SELECT * FROM few WHERE b = 5;

-- @explain T1 "3,000 values of a: hopping would mean thousands of searches. postgres reads the table."
SELECT * FROM many WHERE b = 5;

-- @step T1 "take the seq scan and bitmap scan away, to see the index scan postgres turned down."
SET enable_seqscan = off;
SET enable_bitmapscan = off;

-- @explain T1 "with many values of a, the index scan doesn't hop. it reads the whole index from the first entry to the last."
SELECT * FROM many WHERE b = 5;

-- @explain T1 "the same forced scan on few: it hops."
SELECT * FROM few WHERE b = 5;

-- @step T1 "back to normal."
RESET enable_seqscan;
RESET enable_bitmapscan;

-- @explain T1 "a real one: an index on (status, customer_id) and a lookup by customer alone. six statuses, four searches: the scan only goes back to the root when the next value it needs is not on the leaf page it is already reading."
SELECT id, status FROM orders WHERE customer_id = 42;

-- @step T1 "how many distinct values each leading column has."
SELECT 'few.a' AS col, count(DISTINCT a) AS n FROM few
UNION ALL SELECT 'many.a', count(DISTINCT a) FROM many
UNION ALL SELECT 'orders.status', count(DISTINCT status) FROM orders
ORDER BY col;

-- @step T1 "table and index sizes, in pages."
SELECT c.relname, pg_relation_size(c.oid) / 8192 AS pages
FROM pg_class AS c WHERE c.relname IN ('few', 'many', 'few_a_b', 'many_a_b')
ORDER BY c.relname;
