-- @title the last day of january, two ways
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "every order from noon on january 30th to noon on february 1st, for the time axis."
SELECT ordered_at
FROM orders
WHERE ordered_at >= '2026-01-30 12:00+00' AND ordered_at < '2026-02-01 12:00+00'
ORDER BY ordered_at;

-- @step T1 "BETWEEN with two dates."
SELECT count(*) AS orders
FROM orders
WHERE ordered_at BETWEEN '2026-01-01' AND '2026-01-31';

-- @step T1 "a half-open range: from the first moment of january, up to but not including the first moment of february."
SELECT count(*) AS orders
FROM orders
WHERE ordered_at >= '2026-01-01' AND ordered_at < '2026-02-01';
