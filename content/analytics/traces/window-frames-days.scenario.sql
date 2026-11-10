-- @title a three-day moving sum of purchases across the day the events table is missing
-- @engine pglite
-- @db events
-- @each

-- the ROWS vs RANGE switch on window-frames reads this file. 2026-04-14 has no events at all,
-- so the daily table jumps from the 13th to the 15th. the frame column is array_agg(day) over
-- the same window: the days that fed each sum.

-- @step T1 "ROWS 2 PRECEDING counts rows. after the missing day, the two rows before the 15th are the 12th and the 13th: a three-row frame four days wide."
WITH daily AS (
  SELECT occurred_at::date AS day, count(*) FILTER (WHERE kind = 'purchase') AS purchases
  FROM events
  WHERE occurred_at >= '2026-04-10' AND occurred_at < '2026-04-19'
  GROUP BY 1
)
SELECT day, purchases,
       array_agg(day) OVER w AS frame,
       sum(purchases) OVER w AS three_days
FROM daily
WINDOW w AS (ORDER BY day ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
ORDER BY day;

-- @step T1 "RANGE interval '2 days' PRECEDING measures the day itself. for the 15th that reaches back to the 13th, and the missing 14th just contributes nothing."
WITH daily AS (
  SELECT occurred_at::date AS day, count(*) FILTER (WHERE kind = 'purchase') AS purchases
  FROM events
  WHERE occurred_at >= '2026-04-10' AND occurred_at < '2026-04-19'
  GROUP BY 1
)
SELECT day, purchases,
       array_agg(day) OVER w AS frame,
       sum(purchases) OVER w AS three_days
FROM daily
WINDOW w AS (ORDER BY day RANGE BETWEEN interval '2 days' PRECEDING AND CURRENT ROW)
ORDER BY day;
