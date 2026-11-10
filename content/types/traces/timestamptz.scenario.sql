-- @title one signup instant under four TimeZone settings, the paris clock change, and AT TIME ZONE both ways
-- @engine pglite
-- @db shop
-- @each

-- the zone rulers, the clock-change table and the AT TIME ZONE switch on types/timestamptz read this.
-- customer 12, Ravi Kumar, signed up at 01:30 UTC on 2026-03-29: the night europe's clocks went forward.

-- @step T1 "with TimeZone = UTC, the instant prints as itself."
SET TimeZone = 'UTC';
SELECT created_at FROM customers WHERE id = 12;

-- @step T1 "the same stored value, printed for india: five and a half hours later on the clock."
SET TimeZone = 'Asia/Kolkata';
SELECT created_at FROM customers WHERE id = 12;

-- @step T1 "printed for paris: it's 03:30, half an hour after the clocks jumped from 02:00 to 03:00."
SET TimeZone = 'Europe/Paris';
SELECT created_at FROM customers WHERE id = 12;

-- @step T1 "printed for new york: still the evening before."
SET TimeZone = 'America/New_York';
SELECT created_at FROM customers WHERE id = 12;

-- @step T1 "hourly instants around the signup, and the wall clock each zone shows at each one."
SET TimeZone = 'UTC';
SELECT z.zone, t AS utc, to_char(t AT TIME ZONE z.zone, 'HH24:MI') AS wall
FROM (VALUES (1, 'UTC'), (2, 'Asia/Kolkata'), (3, 'Europe/Paris'), (4, 'America/New_York')) AS z (n, zone)
CROSS JOIN generate_series(timestamptz '2026-03-28 21:00+00', timestamptz '2026-03-29 05:00+00', interval '1 hour') AS t
ORDER BY z.n, t;

-- @step T1 "paris wall-clock times typed in on the morning of the change. 02:00 and 02:30 never happened there."
SET TimeZone = 'Europe/Paris';
SELECT w AS typed, w::timestamptz AS stored, w::timestamptz AT TIME ZONE 'UTC' AS in_utc
FROM (VALUES ('2026-03-29 01:30'), ('2026-03-29 02:00'), ('2026-03-29 02:30'), ('2026-03-29 03:00'), ('2026-03-29 03:30')) AS v (w)
ORDER BY w;

-- @step T1 "timestamptz AT TIME ZONE: an instant in, the wall clock in that zone out, as a plain timestamp."
SET TimeZone = 'UTC';
SELECT timestamptz '2026-03-29 01:30+00' AT TIME ZONE 'Asia/Kolkata' AS result,
       pg_typeof(timestamptz '2026-03-29 01:30+00' AT TIME ZONE 'Asia/Kolkata') AS type;

-- @step T1 "timestamp AT TIME ZONE: a wall clock in, read as that zone's, an instant out."
SET TimeZone = 'UTC';
SELECT timestamp '2026-03-29 01:30' AT TIME ZONE 'Asia/Kolkata' AS result,
       pg_typeof(timestamp '2026-03-29 01:30' AT TIME ZONE 'Asia/Kolkata') AS type;

-- @step T1 "timestamptz to timestamp: the wall clock in the session's zone, and the zone is dropped."
SET TimeZone = 'UTC';
SELECT timestamptz '2026-03-29 01:30+00'::timestamp AS result,
       pg_typeof(timestamptz '2026-03-29 01:30+00'::timestamp) AS type;

-- @step T1 "timestamp to timestamptz: the wall clock read as the session's zone."
SET TimeZone = 'UTC';
SELECT timestamp '2026-03-29 01:30'::timestamptz AS result,
       pg_typeof(timestamp '2026-03-29 01:30'::timestamptz) AS type;
