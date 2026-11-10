-- @title EXPLAIN ANALYZE on shop: a misestimated join, its loops, and what each loop returned
-- @engine pglite
-- @db shop
-- @each

-- the steps run in the same order as the chapter's session=ea block.

-- @step T1 "an index on orders.customer_id, so a join can look a customer's orders up."
CREATE INDEX ON orders (customer_id);

-- @step T1 "the same join as text, the way the run button prints it."
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT c.name, count(*) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris' AND c.country = 'FR'
GROUP BY c.id;

-- @explain T1 "paris customers in france, with their order counts. the planner guesses 2 customers, and there are 66."
SELECT c.name, count(*) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris' AND c.country = 'FR'
GROUP BY c.id;

-- @step T1 "how many orders each of those 66 customers has: what each loop of the inner index scan returned."
SELECT c.id, count(o.id) AS orders
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris' AND c.country = 'FR'
GROUP BY c.id
ORDER BY c.id;
