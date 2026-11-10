-- @title GROUP BY on the shop: buckets made from an expression, and two people called Sam Lee
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "orders per month: the bucket key is an expression, date_trunc('month', ordered_at)."
SELECT date_trunc('month', ordered_at)::date AS month, count(*) AS orders
FROM orders
GROUP BY date_trunc('month', ordered_at)
ORDER BY month;

-- @step T1 "grouped by name, the two Sam Lees fall into one bucket: 37 orders, and no way to tell whose."
SELECT c.name, count(*) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.name IN ('Sam Lee', 'Ada Lovelace')
GROUP BY c.name
ORDER BY c.name;

-- @step T1 "grouped by the primary key, each customer is a bucket of their own. city can be selected too: postgres knows id decides it."
SELECT c.id, c.name, c.city, count(*) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.name IN ('Sam Lee', 'Ada Lovelace')
GROUP BY c.id
ORDER BY c.id;
