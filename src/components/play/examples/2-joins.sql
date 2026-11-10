-- @label joins
-- @db shop
-- the five customers who spent the most, cancelled orders left out
SELECT c.name, c.city, count(DISTINCT o.id) AS orders, sum(i.qty * i.unit_price) AS spent
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
JOIN order_items AS i ON i.order_id = o.id
WHERE o.status <> 'cancelled'
GROUP BY c.id, c.name, c.city
ORDER BY spent DESC, c.id
LIMIT 5;
