-- @title april's purchases per day, with and without a generate_series calendar, and fake data from a hash
-- @engine pglite
-- @db events
-- @each

-- the calendar, the count(*) switch and the histogram on generate-series read this file.
-- 2026-04-14 has no events at all.

-- @step T1 "GROUP BY the day: one row per day that has purchases. 29 rows for a 30-day month, and nothing says which one is missing."
SELECT occurred_at::date AS day, count(*) AS purchases
FROM events
WHERE kind = 'purchase' AND occurred_at >= '2026-04-01' AND occurred_at < '2026-05-01'
GROUP BY 1
ORDER BY 1;

-- @step T1 "a calendar first, then the events: one row per day, whether anything happened or not. the 14th is there, with 0."
SELECT d::date AS day, extract(isodow FROM d)::int AS dow, count(e.id) AS purchases
FROM generate_series(date '2026-04-01', date '2026-04-30', interval '1 day') AS d
LEFT JOIN events AS e
       ON e.occurred_at::date = d::date AND e.kind = 'purchase'
GROUP BY d
ORDER BY d;

-- @step T1 "count(*) counts rows, and the LEFT JOIN made one row for the 14th: the calendar day, padded with NULLs. so the empty day counts 1."
SELECT d::date AS day, count(*) AS purchases
FROM generate_series(date '2026-04-12', date '2026-04-16', interval '1 day') AS d
LEFT JOIN events AS e
       ON e.occurred_at::date = d::date AND e.kind = 'purchase'
GROUP BY d
ORDER BY d;

-- @step T1 "count(e.id) counts only rows where an event matched. the padded row has e.id NULL, so the 14th counts 0."
SELECT d::date AS day, count(e.id) AS purchases
FROM generate_series(date '2026-04-12', date '2026-04-16', interval '1 day') AS d
LEFT JOIN events AS e
       ON e.occurred_at::date = d::date AND e.kind = 'purchase'
GROUP BY d
ORDER BY d;

-- @step T1 "1,000 fake order totals from a hash of the row number, squared so small totals are common, in buckets of 20."
SELECT width_bucket(total, 0, 200, 10) AS bucket, count(*) AS orders
FROM (
  SELECT round(200 * power((hashint4(i)::bigint + 2147483648) / 4294967296.0, 2), 2) AS total
  FROM generate_series(1, 1000) AS i
) AS fake
GROUP BY 1
ORDER BY 1;
