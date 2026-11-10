-- @title CASE and COALESCE, rung by rung
-- @engine pglite
-- @db shop
-- @each

-- the ladders read the first two steps. each query returns the answer and, from a second CASE
-- with the same tests, which rung produced it (0 for the first), so the figure doesn't decide.

-- @step T1 "five products through a price ladder."
SELECT id, name, price,
       CASE WHEN price = 0 THEN 'free'
            WHEN price < 25 THEN 'under 25'
            WHEN price < 100 THEN 'under 100'
            ELSE '100 and up'
       END AS band,
       CASE WHEN price = 0 THEN 0 WHEN price < 25 THEN 1 WHEN price < 100 THEN 2 ELSE 3 END AS rung
FROM products
WHERE id IN (4, 200, 1, 8, 5)
ORDER BY price;

-- @step T1 "three customers through coalesce(city, email, 'nothing on file')."
SELECT id, name, city, email,
       coalesce(city, email, 'nothing on file') AS reach,
       CASE WHEN city IS NOT NULL THEN 0 WHEN email IS NOT NULL THEN 1 ELSE 2 END AS rung
FROM customers
WHERE id IN (42, 6, 11)
ORDER BY id DESC;

-- @step T1 "sorted by the text: alphabetical, which is nobody's idea of an order's life."
SELECT status, count(*) AS orders
FROM orders
GROUP BY status
ORDER BY status;

-- @step T1 "sorted by a CASE that numbers the statuses in the order an order lives them."
SELECT status, count(*) AS orders
FROM orders
GROUP BY status
ORDER BY CASE status
           WHEN 'placed' THEN 1
           WHEN 'paid' THEN 2
           WHEN 'shipped' THEN 3
           WHEN 'delivered' THEN 4
           ELSE 5
         END,
         status;
