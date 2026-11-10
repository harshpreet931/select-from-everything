-- @title HAVING on the shop's products: what HAVING sees, and WHERE against HAVING
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "the table HAVING gets: one row per category, with its aggregates already computed."
SELECT category, count(*) AS products, round(avg(price), 2) AS avg_price
FROM products
GROUP BY category
ORDER BY category NULLS FIRST;

-- @step T1 "HAVING avg(price) > 100 keeps six of the eleven."
SELECT category, count(*) AS products, round(avg(price), 2) AS avg_price
FROM products
GROUP BY category
HAVING avg(price) > 100
ORDER BY category NULLS FIRST;

-- @step T1 "WHERE price > 100 throws out cheap products before grouping. every category has some expensive ones, so all eleven buckets survive, smaller, and their averages jump."
SELECT category, count(*) AS products, round(avg(price), 2) AS avg_price
FROM products
WHERE price > 100
GROUP BY category
ORDER BY category NULLS FIRST;

-- @step T1 "HAVING avg(price) > 100 keeps every product and judges each category by its average: six pass."
SELECT category, count(*) AS products, round(avg(price), 2) AS avg_price
FROM products
GROUP BY category
HAVING avg(price) > 100
ORDER BY category NULLS FIRST;
