-- @title month ends under + interval '1 month', an interval's three fields, and iso weeks across a new year
-- @engine pglite
-- @each

-- the month-end figure, the interval fields table and the week table on types/dates-and-intervals read this.

-- @step T1 "the last four days of january, a month later, a month after that, and two months later in one go."
SELECT d::date AS start,
       (d + interval '1 month')::date AS plus_1,
       (d + interval '1 month' + interval '1 month')::date AS plus_1_plus_1,
       (d + interval '2 months')::date AS plus_2
FROM generate_series(date '2026-01-28', date '2026-01-31', interval '1 day') AS d
ORDER BY d;

-- @step T1 "six intervals, the three fields each one is stored as, and what justify_interval makes of it."
SELECT i AS "interval",
       (extract(year FROM i) * 12 + extract(month FROM i))::int AS months,
       extract(day FROM i)::int AS days,
       i - make_interval(months => (extract(year FROM i) * 12 + extract(month FROM i))::int, days => extract(day FROM i)::int) AS "time",
       justify_interval(i) AS justified
FROM (VALUES (1, interval '36 hours'), (2, interval '1 day 12 hours'), (3, interval '1 month'), (4, interval '30 days'),
             (5, interval '1 month -1 hour'), (6, interval '1 year 2 months 3 days 04:05:06')) AS v (n, i)
ORDER BY n;

-- @step T1 "nine days across a new year: the day, its week (date_trunc starts weeks on monday), the iso week number, and the year it belongs to."
SELECT d::date AS day,
       to_char(d, 'Dy') AS dow,
       date_trunc('week', d)::date AS week_start,
       extract(week FROM d)::int AS iso_week,
       extract(isoyear FROM d)::int AS iso_year,
       extract(year FROM d)::int AS year
FROM generate_series(date '2026-12-28', date '2027-01-05', interval '1 day') AS d
ORDER BY d;
