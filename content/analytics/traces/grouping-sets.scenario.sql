-- @title ROLLUP, CUBE and GROUPING SETS over the shop's orders by year and status
-- @engine pglite
-- @db shop
-- @each

-- the grouping switch on grouping-sets reads the first four steps, the NULL-or-total switch the
-- last two.

-- @step T1 "plain GROUP BY: one row per year and status that exists. 9 rows, and GROUPING() is 0 on every one: nothing is rolled up."
SELECT year, status, count(*) AS orders, GROUPING(year, status) AS g
FROM (SELECT extract(year FROM ordered_at)::int AS year, status FROM orders) AS o
GROUP BY year, status
ORDER BY year NULLS LAST, status NULLS LAST;

-- @step T1 "ROLLUP adds a subtotal per year (status rolled up, GROUPING 1) and a grand total (both rolled up, GROUPING 3). 12 rows."
SELECT year, status, count(*) AS orders, GROUPING(year, status) AS g
FROM (SELECT extract(year FROM ordered_at)::int AS year, status FROM orders) AS o
GROUP BY ROLLUP (year, status)
ORDER BY year NULLS LAST, status NULLS LAST;

-- @step T1 "CUBE adds every combination: the ROLLUP rows, plus a total per status across both years (GROUPING 2). 18 rows."
SELECT year, status, count(*) AS orders, GROUPING(year, status) AS g
FROM (SELECT extract(year FROM ordered_at)::int AS year, status FROM orders) AS o
GROUP BY CUBE (year, status)
ORDER BY year NULLS LAST, status NULLS LAST;

-- @step T1 "GROUPING SETS lists exactly the groupings you want. here only the two kinds of subtotal: 2 years and 6 statuses, no detail and no grand total."
SELECT year, status, count(*) AS orders, GROUPING(year, status) AS g
FROM (SELECT extract(year FROM ordered_at)::int AS year, status FROM orders) AS o
GROUP BY GROUPING SETS ((year), (status))
ORDER BY year NULLS LAST, status NULLS LAST;

-- @step T1 "ROLLUP over category: two rows say NULL. one is the three products that have no category, the other is the grand total. nothing in the output says which is which."
SELECT category, count(*) AS products
FROM products
GROUP BY ROLLUP (category)
ORDER BY products, category;

-- @step T1 "GROUPING(category) is 1 on the row where category was rolled up, so it can label the total, and coalesce can label the real NULLs."
SELECT CASE WHEN GROUPING(category) = 1 THEN '(all)' ELSE coalesce(category, '(none)') END AS category,
       count(*) AS products,
       GROUPING(category) AS g
FROM products
GROUP BY ROLLUP (category)
ORDER BY g, products, category;
