-- @title tuning casebook, cases 1 to 5: shop queries before and after their one change
-- @engine pglite
-- @db shop
-- @each

-- @explain T1 "case 1, before: no index on product_id, so postgres reads all of order_items and throws most of it away."
SELECT order_id, qty FROM order_items WHERE product_id = 150;

-- @step T1 "case 1, the change: an index on the column in the WHERE."
CREATE INDEX order_items_product_id ON order_items (product_id);

-- @explain T1 "case 1, after: a bitmap index scan finds the matching rows, and only their pages are read."
SELECT order_id, qty FROM order_items WHERE product_id = 150;

-- @explain T1 "case 2, before: there's a unique index on email, but the query asks about lower(email), which the index doesn't store."
SELECT id, name FROM customers WHERE lower(email) = 'ada@example.com';

-- @step T1 "case 2, the change: an expression index on lower(email)."
CREATE INDEX customers_lower_email ON customers (lower(email));

-- @explain T1 "case 2, after: the expression in the WHERE matches the index's expression, so it's an index scan."
SELECT id, name FROM customers WHERE lower(email) = 'ada@example.com';

-- @step T1 "case 3, setup: a table of the orders that aren't delivered yet, indexed on status and analyzed. then the 9,352 delivered ones are loaded, and nobody runs ANALYZE."
CREATE TABLE recent AS SELECT * FROM orders WHERE status <> 'delivered' ORDER BY id;
CREATE INDEX recent_status ON recent (status);
ANALYZE recent;
INSERT INTO recent SELECT * FROM orders WHERE status = 'delivered' ORDER BY id;

-- @explain T1 "case 3, before: the statistics still say half the rows are cancelled, so the planner expects thousands and reads the whole table. it finds 317."
SELECT id, customer_id FROM recent WHERE status = 'cancelled';

-- @step T1 "case 3, the change: ANALYZE."
ANALYZE recent;

-- @explain T1 "case 3, after: the estimate is 317, and a bitmap scan reads only the pages that have them."
SELECT id, customer_id FROM recent WHERE status = 'cancelled';

-- @explain T1 "case 4, before: the planner multiplies the two selectivities as if city and country were independent, and underestimates."
SELECT count(*) FROM customers WHERE city = 'London' AND country = 'GB';

-- @step T1 "case 4, the change: extended statistics on the two columns, then ANALYZE."
CREATE STATISTICS customers_city_country (dependencies) ON city, country FROM customers;
ANALYZE customers;

-- @explain T1 "case 4, after: the functional dependency city → country is known, and the estimate matches."
SELECT count(*) FROM customers WHERE city = 'London' AND country = 'GB';

-- @explain T1 "case 5, before: a subquery per customer, the N+1 pattern inside one statement. the SubPlan runs once per Berlin customer, and each run scans orders."
SELECT c.name, (SELECT count(*) FROM orders AS o WHERE o.customer_id = c.id) AS orders
FROM customers AS c WHERE c.city = 'Berlin';

-- @explain T1 "case 5, after: one join and one GROUP BY. orders is scanned once."
SELECT c.name, count(o.id) AS orders
FROM customers AS c LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Berlin'
GROUP BY c.id, c.name;

