-- @title the best sellers in every category, three ways: row_number, LATERAL and DISTINCT ON
-- @engine pglite
-- @db shop
-- @each

-- the podium, the result switch and the plans side by side on top-n-per-group read this file.
-- product_sales is units sold per product, summed once, so the plans show the top-n part only.

-- @setup
CREATE TABLE product_sales AS
SELECT p.id, p.name, p.category, sum(oi.qty)::int AS units
FROM products AS p
JOIN order_items AS oi ON oi.product_id = p.id
GROUP BY p.id
ORDER BY p.id;
ANALYZE product_sales;

-- @step T1 "the three best sellers in every category, numbered within it."
SELECT category, name, units, n
FROM (SELECT *, row_number() OVER (PARTITION BY category ORDER BY units DESC, id) AS n
      FROM product_sales) AS ranked
WHERE n <= 3
ORDER BY category, n;

-- @step T1 "row_number: number each category's products, keep number 1. the three products with no category are a partition of their own, so there's a NULL row."
SELECT category, name, units
FROM (SELECT *, row_number() OVER (PARTITION BY category ORDER BY units DESC, id) AS n
      FROM product_sales) AS ranked
WHERE n = 1
ORDER BY category;

-- @step T1 "LATERAL: list the categories, then run a top-1 subquery for each. the NULL category is gone: s.category = NULL is never true."
SELECT c.category, s.name, s.units
FROM (SELECT DISTINCT category FROM product_sales) AS c
CROSS JOIN LATERAL (
  SELECT name, units FROM product_sales AS s
  WHERE s.category = c.category
  ORDER BY units DESC, id
  LIMIT 1
) AS s
ORDER BY c.category;

-- @step T1 "DISTINCT ON: sort by category and units, keep the first row of each category. NULLs are equal for DISTINCT, so the NULL category stays."
SELECT DISTINCT ON (category) category, name, units
FROM product_sales
ORDER BY category, units DESC, id;

-- @step T1 "one sort by category and units, a WindowAgg that stops numbering each category after 1 (the run condition), and a filter on top."
EXPLAIN (COSTS OFF)
SELECT category, name, units
FROM (SELECT *, row_number() OVER (PARTITION BY category ORDER BY units DESC, id) AS n
      FROM product_sales) AS ranked
WHERE n = 1
ORDER BY category;

-- @step T1 "a nested loop: the distinct categories outside, and inside, once per category, a scan of the whole table, a sort and a limit."
EXPLAIN (COSTS OFF)
SELECT c.category, s.name, s.units
FROM (SELECT DISTINCT category FROM product_sales) AS c
CROSS JOIN LATERAL (
  SELECT name, units FROM product_sales AS s
  WHERE s.category = c.category
  ORDER BY units DESC, id
  LIMIT 1
) AS s
ORDER BY c.category;

-- @step T1 "one sort, then Unique keeps the first row of each category. the smallest plan of the three."
EXPLAIN (COSTS OFF)
SELECT DISTINCT ON (category) category, name, units
FROM product_sales
ORDER BY category, units DESC, id;
