-- @title gaps and islands in the events table: one user's active days, streaks, and sessions
-- @engine pglite
-- @db events
-- @each

-- the island stepper, the streak bars and the session switch on gaps-and-islands read this file.

-- @step T1 "the calendar, march 1 to 19, and whether user 54 did anything that day."
SELECT g::date AS day, d.day IS NOT NULL AS active
FROM generate_series(date '2026-03-01', date '2026-03-19', interval '1 day') AS g
LEFT JOIN (SELECT DISTINCT occurred_at::date AS day FROM events WHERE user_id = 54) AS d
       ON d.day = g::date
ORDER BY 1;

-- @step T1 "the active days, numbered, and the day minus its number."
WITH days AS (
  SELECT DISTINCT occurred_at::date AS day
  FROM events
  WHERE user_id = 54 AND occurred_at < '2026-03-20'
)
SELECT day,
       row_number() OVER (ORDER BY day) AS rn,
       day - row_number() OVER (ORDER BY day)::int AS grp
FROM days
ORDER BY day;

-- @step T1 "one row per island."
WITH days AS (
  SELECT DISTINCT occurred_at::date AS day
  FROM events
  WHERE user_id = 54 AND occurred_at < '2026-03-20'
)
SELECT min(day) AS first, max(day) AS last, count(*) AS days
FROM (
  SELECT day,
         row_number() OVER (ORDER BY day) AS rn,
         day - row_number() OVER (ORDER BY day)::int AS grp
  FROM days
) AS numbered
GROUP BY grp
ORDER BY first;

-- @step T1 "the longest streaks of any user. nobody gets past 47 days: nobody was active on 2026-04-14."
WITH days AS (SELECT DISTINCT user_id, occurred_at::date AS day FROM events),
islands AS (
  SELECT user_id, day, day - row_number() OVER (PARTITION BY user_id ORDER BY day)::int AS grp
  FROM days
)
SELECT user_id, min(day) AS first, max(day) AS last, count(*) AS days
FROM islands
GROUP BY user_id, grp
ORDER BY days DESC, user_id
LIMIT 6;

-- @step T1 "a new session starts whenever the gap since the previous event is over 30 minutes. a running sum of those starts numbers the sessions: 11 of them."
SELECT id, at, kind, gap,
       sum(new) OVER (ORDER BY at, id) AS session
FROM (
  SELECT id, occurred_at::time AS at, kind,
         occurred_at - lag(occurred_at) OVER w AS gap,
         CASE WHEN occurred_at - lag(occurred_at) OVER w <= interval '30 minutes'
              THEN 0 ELSE 1 END AS new
  FROM events
  WHERE user_id = 1 AND occurred_at >= '2026-03-02' AND occurred_at < '2026-03-03'
  WINDOW w AS (ORDER BY occurred_at, id)
) AS flagged
ORDER BY at, id;

-- @step T1 "same events, a 90-minute timeout. gaps that were too long before now fit, and the 14 events make 5 sessions."
SELECT id, at, kind, gap,
       sum(new) OVER (ORDER BY at, id) AS session
FROM (
  SELECT id, occurred_at::time AS at, kind,
         occurred_at - lag(occurred_at) OVER w AS gap,
         CASE WHEN occurred_at - lag(occurred_at) OVER w <= interval '90 minutes'
              THEN 0 ELSE 1 END AS new
  FROM events
  WHERE user_id = 1 AND occurred_at >= '2026-03-02' AND occurred_at < '2026-03-03'
  WINDOW w AS (ORDER BY occurred_at, id)
) AS flagged
ORDER BY at, id;

