-- @title a correlated subquery, run once per outer row: each product against its category's average
-- @engine pglite
-- @db shop
-- @each

-- the stepper on subqueries reads these: four products, then the inner query with each one's
-- category filled in (exactly what postgres reruns for that row), then the whole query. the last
-- step is the plan for all 200 products, with the SubPlan's loops counted.

-- @step T1 "the outer rows: four products, one with no category."
SELECT id, name, category, price FROM products WHERE id IN (1, 3, 5, 7) ORDER BY id;

-- @step T1 "the chef's knife is in kitchen, so the inner query averages kitchen: 88.62. the knife costs 49.00, well under."
SELECT round(avg(p2.price), 2) AS category_avg FROM products AS p2 WHERE p2.category = 'kitchen';

-- @step T1 "the art of sql is in books. a new outer row, a new value, the inner query runs again: 92.15."
SELECT round(avg(p2.price), 2) AS category_avg FROM products AS p2 WHERE p2.category = 'books';

-- @step T1 "studio headphones, audio: 119.84. and again."
SELECT round(avg(p2.price), 2) AS category_avg FROM products AS p2 WHERE p2.category = 'audio';

-- @step T1 "the wooden train has no category. category = NULL matches no row, the average of no rows is NULL, so its category_avg is NULL. no error."
SELECT round(avg(p2.price), 2) AS category_avg FROM products AS p2 WHERE p2.category = NULL;

-- @step T1 "the whole query: one inner run per outer row, glued on as a column."
SELECT p.id, p.name, p.price,
       (SELECT round(avg(p2.price), 2) FROM products AS p2 WHERE p2.category = p.category) AS category_avg
FROM products AS p
WHERE p.id IN (1, 3, 5, 7)
ORDER BY p.id;

-- @explain T1 "the plan for all 200 products: the SubPlan under the scan runs once per row."
SELECT p.id, p.name, p.price,
       (SELECT round(avg(p2.price), 2) FROM products AS p2 WHERE p2.category = p.category) AS category_avg
FROM products AS p;
