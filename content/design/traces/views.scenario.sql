-- @title views: rows escaping an updatable view, a view running as its owner or its caller, and a materialized view going stale
-- @engine pglite
-- @each

-- views reads these for three RunPicks.

-- @step T1 "products, and two views of the cheap ones: one plain, one WITH CHECK OPTION."
CREATE TABLE products (id int PRIMARY KEY, name text NOT NULL, price numeric(8,2) NOT NULL);
INSERT INTO products VALUES (1, 'assam tea', 6.50), (2, 'blue mug', 12.00), (3, 'teapot', 45.00);
CREATE VIEW cheap AS SELECT id, name, price FROM products WHERE price < 10;
CREATE VIEW cheap_checked AS SELECT id, name, price FROM products WHERE price < 10 WITH CHECK OPTION;

-- @step T1 "through the plain view, insert a product at 30.00. the view's WHERE says under 10, and nothing stops it."
INSERT INTO cheap VALUES (4, 'tea chest', 30.00);

-- @step T1 "the row went into products, and the view can't see what it just inserted."
SELECT id, name, price FROM cheap ORDER BY id;

-- @step T1 errors=44000 "the same insert through the checked view: the new row would be invisible to the view, so it's refused."
INSERT INTO cheap_checked VALUES (5, 'tea chest', 30.00);

-- @step T1 errors=44000 "and an UPDATE that would push a row out of the view is refused too."
UPDATE cheap_checked SET price = 15.00 WHERE id = 1;

-- @step T1 "a role that may read a view of products, but not products itself."
CREATE ROLE views_clerk;
CREATE VIEW price_list AS SELECT name, price FROM products;
CREATE VIEW price_list_invoker WITH (security_invoker = true) AS SELECT name, price FROM products;
GRANT SELECT ON price_list, price_list_invoker TO views_clerk;

-- @step T1 "as the clerk, the default view: it reads products with its owner's rights, so it works."
SET ROLE views_clerk;
SELECT name, price FROM price_list ORDER BY name;

-- @step T1 errors=42501 "the security_invoker view checks the clerk's own rights on products, and the clerk has none."
SELECT name, price FROM price_list_invoker ORDER BY name;

-- @step T1 "back to the owner. a materialized view of revenue per product, from order lines."
RESET ROLE;
CREATE TABLE order_lines (order_id int, product_id int REFERENCES products, qty int NOT NULL);
INSERT INTO order_lines VALUES (100, 1, 2), (100, 2, 1), (101, 1, 3);
CREATE MATERIALIZED VIEW revenue AS
SELECT p.id, p.name, sum(l.qty * p.price) AS revenue
FROM products AS p JOIN order_lines AS l ON l.product_id = p.id GROUP BY p.id, p.name;

-- @step T1 "a new order comes in: three teapots."
INSERT INTO order_lines VALUES (102, 3, 3);

-- @step T1 "the materialized view still shows what was true when it was built. no teapot."
SELECT id, name, revenue FROM revenue ORDER BY id;

-- @step T1 "the same query, live, sees it."
SELECT p.id, p.name, sum(l.qty * p.price) AS revenue
FROM products AS p JOIN order_lines AS l ON l.product_id = p.id GROUP BY p.id, p.name ORDER BY p.id;

-- @step T1 errors=55000 "REFRESH ... CONCURRENTLY needs a unique index to match old rows to new ones, and there isn't one."
REFRESH MATERIALIZED VIEW CONCURRENTLY revenue;

-- @step T1 "with a unique index on id, the concurrent refresh works: readers keep the old rows until it commits."
CREATE UNIQUE INDEX ON revenue (id);
REFRESH MATERIALIZED VIEW CONCURRENTLY revenue;

-- @step T1 "after the refresh."
SELECT id, name, revenue FROM revenue ORDER BY id;
