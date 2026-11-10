-- @title an algebra expression and the plan postgres runs for it
-- @engine pglite
-- @db shop
-- @each

-- @explain T1 "π name (σ city = 'Paris' (customers) ⋈ orders): the names of paris customers who have ordered."
SELECT DISTINCT c.name
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris';
