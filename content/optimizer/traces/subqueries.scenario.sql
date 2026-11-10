-- @title subqueries, written different ways, and the plans they become
-- @engine pglite
-- @db shop
-- @each

-- subquery-planning reads this file: for each way of writing it, the query's result and its plan
-- (EXPLAIN ANALYZE, so SubPlan loops show). the work_mem steps bracket the two 64kB variants.

-- @step T1 "IN becomes a semi join: the refunded orders' customer ids are de-duplicated, then joined to customers."
SELECT count(*) FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE status = 'refunded');

-- @explain T1 "IN | refunded"
SELECT count(*) FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE status = 'refunded');

-- @step T1 "EXISTS with a correlated condition: pulled up into the same semi join, the same plan."
SELECT count(*) FROM customers AS c
WHERE EXISTS (SELECT 1 FROM orders AS o
              WHERE o.customer_id = c.id AND o.status = 'refunded');

-- @explain T1 "EXISTS | refunded"
SELECT count(*) FROM customers AS c
WHERE EXISTS (SELECT 1 FROM orders AS o
              WHERE o.customer_id = c.id AND o.status = 'refunded');

-- @step T1 "with all 10,000 orders on the inner side, the same idea: 10,000 customer ids de-duplicated to 1,962, then joined."
SELECT count(*) FROM customers
WHERE id IN (SELECT customer_id FROM orders);

-- @explain T1 "IN | any order"
SELECT count(*) FROM customers
WHERE id IN (SELECT customer_id FROM orders);

-- @step T1 "and EXISTS lands on the same plan again."
SELECT count(*) FROM customers AS c
WHERE EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.id);

-- @explain T1 "EXISTS | any order"
SELECT count(*) FROM customers AS c
WHERE EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.id);

-- @step T1 "NOT IN can't become an anti join (a NULL in the subquery would change the answer), so it stays a SubPlan: hashed, built once."
SELECT count(*) FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);

-- @explain T1 "NOT IN | 4MB"
SELECT count(*) FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);

-- @step T1 "NOT EXISTS becomes an anti join."
SELECT count(*) FROM customers AS c
WHERE NOT EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.id);

-- @explain T1 "NOT EXISTS | 4MB"
SELECT count(*) FROM customers AS c
WHERE NOT EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.id);

-- @step T1 "shrink work_mem so the hashed SubPlan doesn't fit."
SET work_mem = '64kB';

-- @step T1 "with work_mem too small for the hash table, NOT IN becomes a plain SubPlan: the materialized orders are scanned again for every customer."
SELECT count(*) FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);

-- @explain T1 "NOT IN | 64kB"
SELECT count(*) FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);

-- @step T1 "the anti join doesn't care much: it adapts its join method."
SELECT count(*) FROM customers AS c
WHERE NOT EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.id);

-- @explain T1 "NOT EXISTS | 64kB"
SELECT count(*) FROM customers AS c
WHERE NOT EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.id);

-- @step T1 "back to the default."
RESET work_mem;

-- @step T1 "a CTE used once is inlined: both conditions end up on one scan of customers."
WITH fr AS (SELECT id, name, city FROM customers WHERE country = 'FR')
SELECT count(*) FROM fr WHERE city = 'Paris';

-- @explain T1 "inlined"
WITH fr AS (SELECT id, name, city FROM customers WHERE country = 'FR')
SELECT count(*) FROM fr WHERE city = 'Paris';

-- @step T1 "MATERIALIZED keeps it separate: the CTE runs first, and the outer filter runs on its result."
WITH fr AS MATERIALIZED (SELECT id, name, city FROM customers WHERE country = 'FR')
SELECT count(*) FROM fr WHERE city = 'Paris';

-- @explain T1 "MATERIALIZED"
WITH fr AS MATERIALIZED (SELECT id, name, city FROM customers WHERE country = 'FR')
SELECT count(*) FROM fr WHERE city = 'Paris';

-- @step T1 "OFFSET 0 is the old trick for the same thing: a subquery with a LIMIT or OFFSET can't be pulled up."
SELECT count(*)
FROM (SELECT id, name, city FROM customers WHERE country = 'FR' OFFSET 0) AS fr
WHERE city = 'Paris';

-- @explain T1 "OFFSET 0"
SELECT count(*)
FROM (SELECT id, name, city FROM customers WHERE country = 'FR' OFFSET 0) AS fr
WHERE city = 'Paris';

-- @step T1 "a correlated scalar subquery in SELECT is a SubPlan, run once per outer row: 66 scans of orders."
SELECT c.name, (SELECT count(*) FROM orders AS o WHERE o.customer_id = c.id) AS orders
FROM customers AS c
WHERE c.city = 'Paris'
ORDER BY c.id;

-- @explain T1 "scalar"
SELECT c.name, (SELECT count(*) FROM orders AS o WHERE o.customer_id = c.id) AS orders
FROM customers AS c
WHERE c.city = 'Paris'
ORDER BY c.id;
