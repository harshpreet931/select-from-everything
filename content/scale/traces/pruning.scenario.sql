-- @title events split into three monthly partitions, and which of them each query reads
-- @engine pglite
-- @db events
-- @each

-- partitioning reads this file: captured on PGlite with the events dataset, so the plans match the
-- run buttons on the page. one count, then the same count under four WHERE clauses.

-- @setup
SET TimeZone = 'UTC';
CREATE TABLE ev (
  id          bigint NOT NULL,
  user_id     int NOT NULL,
  kind        text NOT NULL,
  occurred_at timestamptz NOT NULL,
  amount      numeric(10,2)
) PARTITION BY RANGE (occurred_at);
CREATE TABLE ev_2026_03 PARTITION OF ev FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE ev_2026_04 PARTITION OF ev FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE ev_2026_05 PARTITION OF ev FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
INSERT INTO ev SELECT id, user_id, kind, occurred_at, amount FROM events ORDER BY id;
ANALYZE ev;

-- @step T1 "how the 25,000 events landed: one partition per month."
SELECT tableoid::regclass AS partition, count(*) AS rows
FROM ev GROUP BY tableoid ORDER BY partition;

-- @explain T1 "a range inside april: the planner proves march and may can't match, and leaves them out of the plan."
SELECT count(*) FROM ev WHERE occurred_at >= '2026-04-01' AND occurred_at < '2026-04-15';

-- @explain T1 "a range across a month boundary: two partitions."
SELECT count(*) FROM ev WHERE occurred_at >= '2026-04-25' AND occurred_at < '2026-05-05';

-- @explain T1 "no condition on the partition key: every partition is read."
SELECT count(*) FROM ev WHERE user_id = 17;

-- @step T1 "a prepared statement with a generic plan: the value isn't known when the plan is made."
SET plan_cache_mode = force_generic_plan;
PREPARE by_day(timestamptz) AS
  SELECT count(*) FROM ev WHERE occurred_at >= $1 AND occurred_at < $1 + interval '1 day';

-- @explain T1 "the plan has all three partitions; the executor removes two before it starts (Subplans Removed: 2)."
EXECUTE by_day('2026-04-20');

-- @explain T1 "the cutoff comes from a subquery: all three partitions start, and two are never executed."
SELECT count(*) FROM ev WHERE occurred_at >= (SELECT max(occurred_at) FROM events) - interval '1 day';
