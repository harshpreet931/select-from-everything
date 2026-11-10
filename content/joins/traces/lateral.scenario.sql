-- @title the latest three orders per customer, one LATERAL subquery per customer
-- @engine pglite
-- @db shop
-- @each

-- the stepper, the switch and the plan on lateral-joins read these. three customers: Maya Chen
-- (lots of orders), Ming Li (none) and Ada Lovelace.

-- @step T1 "the left side: three customers."
SELECT id, name FROM customers WHERE id IN (1, 7, 42) ORDER BY id;

-- @step T1 "for Maya Chen, the subquery runs with c.id = 1: her three latest orders, out of 57."
SELECT o.id, o.status, o.ordered_at::date AS day
FROM orders AS o
WHERE o.customer_id = 1
ORDER BY o.ordered_at DESC
LIMIT 3;

-- @step T1 "for Ming Li, c.id = 7. she has never ordered, so the subquery returns no rows."
SELECT o.id, o.status, o.ordered_at::date AS day
FROM orders AS o
WHERE o.customer_id = 7
ORDER BY o.ordered_at DESC
LIMIT 3;

-- @step T1 "for Ada, c.id = 42: three of her seven orders."
SELECT o.id, o.status, o.ordered_at::date AS day
FROM orders AS o
WHERE o.customer_id = 42
ORDER BY o.ordered_at DESC
LIMIT 3;

-- @step T1 "CROSS JOIN LATERAL: each customer joined to whatever their subquery returned. Ming Li's returned nothing, so she has no rows here, like an inner join."
SELECT c.id, c.name, o.id AS order_id, o.day
FROM customers AS c
CROSS JOIN LATERAL (
  SELECT o.id, o.ordered_at::date AS day
  FROM orders AS o
  WHERE o.customer_id = c.id
  ORDER BY o.ordered_at DESC
  LIMIT 3
) AS o
WHERE c.id IN (1, 7, 42)
ORDER BY c.id, o.day DESC, o.id DESC;

-- @step T1 "LEFT JOIN LATERAL ... ON true: same subqueries, but a customer whose subquery returned nothing comes back once, padded. Ming Li is back."
SELECT c.id, c.name, o.id AS order_id, o.day
FROM customers AS c
LEFT JOIN LATERAL (
  SELECT o.id, o.ordered_at::date AS day
  FROM orders AS o
  WHERE o.customer_id = c.id
  ORDER BY o.ordered_at DESC
  LIMIT 3
) AS o ON true
WHERE c.id IN (1, 7, 42)
ORDER BY c.id, o.day DESC, o.id DESC;

-- @explain T1 "the plan: a nested loop, with the whole subquery (scan, sort, limit) on its inner side, run once per customer."
SELECT c.id, c.name, o.id AS order_id, o.day
FROM customers AS c
CROSS JOIN LATERAL (
  SELECT o.id, o.ordered_at::date AS day
  FROM orders AS o
  WHERE o.customer_id = c.id
  ORDER BY o.ordered_at DESC
  LIMIT 3
) AS o
WHERE c.id IN (1, 7, 42);
