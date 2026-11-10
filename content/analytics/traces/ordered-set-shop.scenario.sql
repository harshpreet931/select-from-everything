-- @title mean against median product price, per category
-- @engine pglite
-- @db shop
-- @each

-- the avg-vs-median bars on ordered-set-aggregates read this file.

-- @step T1 "avg and median price per category, for the categories where they're furthest apart."
SELECT category,
       round(avg(price), 2) AS avg,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::numeric(10,2) AS median
FROM products
WHERE category IS NOT NULL
GROUP BY category
ORDER BY abs(avg(price) - percentile_cont(0.5) WITHIN GROUP (ORDER BY price)) DESC, category
LIMIT 4;
