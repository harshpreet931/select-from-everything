-- @title the products query, one clause at a time
-- @engine pglite
-- @db shop
-- @each

-- every stage is a real query whose result is the table that clause hands on. the stage
-- queries carry 5 of products' 9 columns (sku, tags, attrs and description stay out, so the
-- capture stays small), with name last so the 4 the query reads fit on a phone. each has an
-- ORDER BY of its own so the rows come back the same way every run: the 12 discontinued
-- products first at FROM, so the figure can strike them, and the bucket order (NULL first) at
-- GROUP BY and HAVING.

-- @stages T1 "the query, clause by clause"
SELECT category, count(*) AS n, round(avg(price), 2) AS avg_price
FROM products
WHERE NOT discontinued
GROUP BY category
HAVING count(*) >= 10
ORDER BY avg_price DESC
LIMIT 3;
-- @stage FROM "FROM hands over all 200 products. a table has no order of its own, so they're drawn with the 12 discontinued ones on top, where you can watch them go."
SELECT id, category, price, discontinued, name FROM products ORDER BY discontinued DESC, id;
-- @stage WHERE
SELECT id, category, price, discontinued, name FROM products WHERE NOT discontinued ORDER BY id;
-- @stage GROUP BY "the same 188 rows, sorted into 11 buckets, one per category. the 3 products with no category share a bucket: when grouping, NULLs count as equal."
SELECT id, category, price, discontinued, name FROM products WHERE NOT discontinued ORDER BY category NULLS FIRST, id;
-- @stage HAVING "HAVING judges whole buckets, never single rows. the NULL bucket's count(*) is 3, so it goes, all 3 rows at once. 10 buckets are left."
SELECT id, category, price, discontinued, name
FROM (SELECT p.*, count(*) OVER (PARTITION BY category) AS rows_in_bucket FROM products AS p WHERE NOT discontinued) AS b
WHERE rows_in_bucket >= 10
ORDER BY category NULLS FIRST, id;
-- @stage SELECT
SELECT category, count(*) AS n, round(avg(price), 2) AS avg_price FROM products WHERE NOT discontinued GROUP BY category HAVING count(*) >= 10 ORDER BY category;
-- @stage ORDER BY
SELECT category, count(*) AS n, round(avg(price), 2) AS avg_price FROM products WHERE NOT discontinued GROUP BY category HAVING count(*) >= 10 ORDER BY avg_price DESC;
-- @stage LIMIT
SELECT category, count(*) AS n, round(avg(price), 2) AS avg_price FROM products WHERE NOT discontinued GROUP BY category HAVING count(*) >= 10 ORDER BY avg_price DESC LIMIT 3;

-- @explain T1 "the plan for the same query: four nodes for seven clauses."
SELECT category, count(*) AS n, round(avg(price), 2) AS avg_price
FROM products
WHERE NOT discontinued
GROUP BY category
HAVING count(*) >= 10
ORDER BY avg_price DESC
LIMIT 3;
