-- @title seven reasons an index isn't used, each with a fix
-- @engine pglite
-- @db shop
-- @each

-- index-not-used reads this file. orders gets indexes on customer_id and status, customers on name.

-- @setup
CREATE INDEX orders_customer ON orders (customer_id);
CREATE INDEX orders_status ON orders (status);
CREATE INDEX customers_name ON customers (name);

-- @explain T1 noanalyze "a function wrapped around the column: the index has name, not lower(name)."
SELECT id FROM customers WHERE lower(name) = 'ada lovelace';
-- @explain T1 noanalyze "compare the column itself and the index works."
SELECT id FROM customers WHERE name = 'Ada Lovelace';

-- @explain T1 noanalyze "42.0 is numeric, customer_id is int: postgres casts the column, and the int index no longer applies."
SELECT id FROM orders WHERE customer_id = 42.0;
-- @explain T1 noanalyze "the same value as an int literal (or a quoted '42', which takes the column's type)."
SELECT id FROM orders WHERE customer_id = 42;

-- @explain T1 noanalyze "a leading wildcard: the match could start anywhere, so sorted order doesn't help."
SELECT id FROM customers WHERE name LIKE '%Lovelace';
-- @explain T1 noanalyze "a fixed prefix is a range in sorted order: 'Ada' up to 'Adb'."
SELECT id FROM customers WHERE name LIKE 'Ada%';

-- @explain T1 noanalyze "OR with a column that has no index: one side can't be answered from an index, so the table is read."
SELECT id FROM orders WHERE customer_id = 42 OR shipped_at IS NULL;
-- @explain T1 noanalyze "OR between two indexed columns: one bitmap per index, combined with BitmapOr."
SELECT id FROM orders WHERE customer_id = 42 OR status = 'placed';

-- @explain T1 noanalyze "93% of the orders are delivered: reading the table is cheaper than the index."
SELECT id FROM orders WHERE status = 'delivered';
-- @explain T1 noanalyze "0.5% are placed: the index wins."
SELECT id FROM orders WHERE status = 'placed';

-- @step T1 "a table loaded after its last ANALYZE: statistics say almost every row is 'new'."
CREATE TABLE jobs (id int PRIMARY KEY, state text NOT NULL);
INSERT INTO jobs SELECT g, CASE WHEN g <= 20 THEN 'done' ELSE 'new' END FROM generate_series(1, 10000) AS g ORDER BY g;
CREATE INDEX jobs_state ON jobs (state);
ANALYZE jobs;
UPDATE jobs SET state = 'done' WHERE id <= 9980;

-- @explain T1 "stale statistics: they say 0.2% of jobs are done, so postgres expects a few dozen rows and walks the index. there are 9,980."
SELECT id FROM jobs WHERE state = 'done';
-- @step T1 "ANALYZE."
ANALYZE jobs;
-- @explain T1 "fresh statistics: a seq scan, which is right for 99.8% of the table."
SELECT id FROM jobs WHERE state = 'done';
