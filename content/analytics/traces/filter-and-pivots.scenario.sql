-- @title FILTER and pivots on the shop's orders: the last four months by status
-- @engine pglite
-- @db shop
-- @each

-- the pivot figure, the which-rows-count figure and the spelling switch on filter-and-pivots
-- read this file. june 2026 is the last month, still in flight, so it's the only one with
-- orders placed, paid or shipped.

-- @step T1 "long: one row per month and status."
SELECT date_trunc('month', ordered_at)::date AS month, status, count(*) AS n
FROM orders
WHERE ordered_at >= '2026-03-01'
GROUP BY 1, 2
ORDER BY 1, 2;

-- @step T1 "wide: one row per month, one column per FILTER."
SELECT date_trunc('month', ordered_at)::date AS month,
       count(*) FILTER (WHERE status = 'delivered') AS delivered,
       count(*) FILTER (WHERE status IN ('placed', 'paid', 'shipped')) AS in_flight,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
       count(*) FILTER (WHERE status = 'refunded') AS refunded
FROM orders
WHERE ordered_at >= '2026-03-01'
GROUP BY 1
ORDER BY 1;

-- @step T1 "Ada Lovelace's seven orders, and for each FILTER, whether its condition is true for that row."
SELECT id, status,
       true AS "count(*)",
       status = 'delivered' AS delivered,
       status IN ('placed', 'paid', 'shipped') AS in_flight,
       status = 'cancelled' AS cancelled
FROM orders
WHERE customer_id = 42
ORDER BY id;

-- @step T1 "the aggregates over Ada's orders: each one counted only the rows its FILTER let through."
SELECT count(*) AS "count(*)",
       count(*) FILTER (WHERE status = 'delivered') AS delivered,
       count(*) FILTER (WHERE status IN ('placed', 'paid', 'shipped')) AS in_flight,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled
FROM orders
WHERE customer_id = 42;

-- @step T1 "FILTER: the condition sits right next to the aggregate. 18 cancelled orders in march."
SELECT date_trunc('month', ordered_at)::date AS month,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled
FROM orders
WHERE ordered_at >= '2026-03-01'
GROUP BY 1
ORDER BY 1;

-- @step T1 "sum(CASE ... THEN 1 ELSE 0 END): the spelling from before FILTER existed. same numbers."
SELECT date_trunc('month', ordered_at)::date AS month,
       sum(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
FROM orders
WHERE ordered_at >= '2026-03-01'
GROUP BY 1
ORDER BY 1;

-- @step T1 "count(CASE ... THEN 1 END): no ELSE, so the other rows give NULL, and count skips NULLs. same numbers again."
SELECT date_trunc('month', ordered_at)::date AS month,
       count(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled
FROM orders
WHERE ordered_at >= '2026-03-01'
GROUP BY 1
ORDER BY 1;

-- @step T1 "count(CASE ... THEN 1 ELSE 0 END): wrong. 0 isn't NULL, so count counts it, and every order in the month is 'cancelled'."
SELECT date_trunc('month', ordered_at)::date AS month,
       count(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
FROM orders
WHERE ordered_at >= '2026-03-01'
GROUP BY 1
ORDER BY 1;
