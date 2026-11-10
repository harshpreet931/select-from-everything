-- @title events per user, with postgres's own hash of each user_id, for the shard map figure
-- @engine pglite
-- @db events
-- @each

-- sharding reads this file. the figure places users on shards itself (that part is a model), but
-- the load it draws is the real number of events per user in the events dataset, and the hash is
-- postgres's hashint4. events in the last week stand in for "today's writes".

-- @step T1 "per user: their events, their events in the dataset's last 7 days, and hashint4(user_id)."
SELECT user_id,
       count(*) AS events,
       count(*) FILTER (WHERE occurred_at >= timestamptz '2026-05-25 00:00+00') AS last_week,
       hashint4(user_id) AS h
FROM events
GROUP BY user_id
ORDER BY user_id;

-- @step T1 "per month, for a shard map keyed on time."
SELECT date_trunc('month', occurred_at AT TIME ZONE 'UTC')::date AS month,
       count(*) AS events,
       count(*) FILTER (WHERE occurred_at >= timestamptz '2026-05-25 00:00+00') AS last_week
FROM events
GROUP BY 1
ORDER BY 1;
