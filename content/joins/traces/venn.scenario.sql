-- @title the shop's products and order lines, counted every way a venn diagram draws them
-- @engine pglite
-- @db shop
-- @each

-- the venn figure on joins-in-one-picture reads these counts. every number it shows is one of
-- these results.

-- @step T1 "how many products."
SELECT count(*) FROM products;

-- @step T1 "how many order lines."
SELECT count(*) FROM order_items;

-- @step T1 "INNER JOIN: one row per (product, order line) pair that matches. every line has a product."
SELECT count(*) FROM products AS p JOIN order_items AS oi ON oi.product_id = p.id;

-- @step T1 "LEFT JOIN: every matching pair, plus each product that matched nothing (the teapot), padded with NULLs."
SELECT count(*) FROM products AS p LEFT JOIN order_items AS oi ON oi.product_id = p.id;

-- @step T1 "FULL JOIN: the same here. a foreign key means no order line is ever without its product."
SELECT count(*) FROM products AS p FULL JOIN order_items AS oi ON oi.product_id = p.id;

-- @step T1 "INTERSECT: the product ids that appear on both sides, once each. this is what the overlap actually draws."
SELECT count(*) FROM (SELECT id FROM products INTERSECT SELECT product_id FROM order_items) AS x;

-- @step T1 "EXCEPT: product ids with no order line at all. just one: the left-handed teapot."
SELECT count(*) FROM (SELECT id FROM products EXCEPT SELECT product_id FROM order_items) AS x;

-- @step T1 "UNION: every product id from either side, once. order lines can't add a new one."
SELECT count(*) FROM (SELECT id FROM products UNION SELECT product_id FROM order_items) AS x;
