-- @title LAG and LEAD over the shop's monthly revenue, and a running total
-- @engine pglite
-- @db shop
-- @each

-- the arrow figure and the running total bars on lag-and-lead read this file. monthly is a
-- view: revenue per month, cancelled and refunded orders left out. each step also selects
-- lag(month) or lead(month) over the same window: postgres's own answer to "which row did it read".

-- @setup
CREATE VIEW monthly AS
SELECT date_trunc('month', o.ordered_at)::date AS month,
       sum(oi.qty * oi.unit_price) AS revenue
FROM orders AS o
JOIN order_items AS oi ON oi.order_id = o.id
WHERE o.status NOT IN ('cancelled', 'refunded')
GROUP BY 1;

-- @step T1 "lag(revenue) reads the row one before in the window's order: last month. july has no row before it, so it gets NULL."
SELECT month, revenue,
       lag(month)   OVER w AS read_from,
       lag(revenue) OVER w AS value
FROM monthly
WINDOW w AS (ORDER BY month)
ORDER BY month;

-- @step T1 "lag(revenue, 2) reads two rows back. the first two months have nothing that far back."
SELECT month, revenue,
       lag(month, 2)   OVER w AS read_from,
       lag(revenue, 2) OVER w AS value
FROM monthly
WINDOW w AS (ORDER BY month)
ORDER BY month;

-- @step T1 "lead(revenue) looks the other way: next month. now it's june, the last row, that has nothing to read."
SELECT month, revenue,
       lead(month)   OVER w AS read_from,
       lead(revenue) OVER w AS value
FROM monthly
WINDOW w AS (ORDER BY month)
ORDER BY month;

-- @step T1 "a running total: sum over the default frame, from the first month to this one."
SELECT month, revenue,
       sum(revenue) OVER (ORDER BY month) AS running_total
FROM monthly
ORDER BY month;

-- @step T1 "a running total: the frame starts at the first month and ends at this one, so it grows by a month every row."
SELECT month, revenue,
       array_agg(month) OVER w AS frame,
       sum(revenue)     OVER w AS total
FROM monthly
WINDOW w AS (ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
ORDER BY month;

-- @step T1 "a three-month moving total: the frame is this month and the two before, so it slides instead of growing. the first two months have shorter frames."
SELECT month, revenue,
       array_agg(month) OVER w AS frame,
       sum(revenue)     OVER w AS total
FROM monthly
WINDOW w AS (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
ORDER BY month;
