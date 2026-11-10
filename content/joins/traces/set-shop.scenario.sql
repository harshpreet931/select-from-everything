-- @title customers who ordered in 2025 and in 2026, combined, and the two plans for UNION
-- @engine pglite
-- @db shop
-- @each

-- the switch and the plans on set-operations read these. 2025 means before 2026-01-01 UTC.

-- @step T1 "UNION: customers who ordered in either year, each once. that's every customer who ever ordered."
SELECT count(*) AS customers FROM (
  SELECT customer_id FROM orders WHERE ordered_at < timestamptz '2026-01-01 00:00+00'
  UNION
  SELECT customer_id FROM orders WHERE ordered_at >= timestamptz '2026-01-01 00:00+00'
) AS x;

-- @step T1 "UNION ALL: one row per order, from either year. nobody was deduplicated, so this counts orders, not customers."
SELECT count(*) AS customers FROM (
  SELECT customer_id FROM orders WHERE ordered_at < timestamptz '2026-01-01 00:00+00'
  UNION ALL
  SELECT customer_id FROM orders WHERE ordered_at >= timestamptz '2026-01-01 00:00+00'
) AS x;

-- @step T1 "INTERSECT: customers who ordered in both years."
SELECT count(*) AS customers FROM (
  SELECT customer_id FROM orders WHERE ordered_at < timestamptz '2026-01-01 00:00+00'
  INTERSECT
  SELECT customer_id FROM orders WHERE ordered_at >= timestamptz '2026-01-01 00:00+00'
) AS x;

-- @step T1 "EXCEPT: customers who ordered in 2025 and haven't been back in 2026. the ones to email."
SELECT count(*) AS customers FROM (
  SELECT customer_id FROM orders WHERE ordered_at < timestamptz '2026-01-01 00:00+00'
  EXCEPT
  SELECT customer_id FROM orders WHERE ordered_at >= timestamptz '2026-01-01 00:00+00'
) AS x;

-- @explain T1 noanalyze "UNION: an Append of both sides, then a HashAggregate to throw duplicates away."
SELECT customer_id FROM orders WHERE ordered_at < timestamptz '2026-01-01 00:00+00'
UNION
SELECT customer_id FROM orders WHERE ordered_at >= timestamptz '2026-01-01 00:00+00';

-- @explain T1 noanalyze "UNION ALL: just the Append."
SELECT customer_id FROM orders WHERE ordered_at < timestamptz '2026-01-01 00:00+00'
UNION ALL
SELECT customer_id FROM orders WHERE ordered_at >= timestamptz '2026-01-01 00:00+00';
