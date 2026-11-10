-- @label windows
-- @db events
-- purchases per day in the first week of april, with a running total
SELECT occurred_at::date AS day,
       count(*) AS purchases,
       sum(count(*)) OVER (ORDER BY occurred_at::date) AS running_total
FROM events
WHERE kind = 'purchase'
  AND occurred_at >= '2026-04-01' AND occurred_at < '2026-04-08'
GROUP BY occurred_at::date
ORDER BY day;
