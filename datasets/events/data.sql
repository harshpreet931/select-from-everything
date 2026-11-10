-- events data.
--   2026-03-01 to 2026-05-31 UTC, inserted in time order (so BRIN sees correlation 1.0)
--   no events at all on 2026-04-14: 91 active days, everything from that date shifted by one
--   the range crosses US DST (03-08) and EU DST (03-29)
--   users 1 to 500, skewed (u^2); each user's first event is their signup
--   user 17: one event every day for 30 days from 2026-04-21, except 2026-05-05 (a broken streak)
--   props: {"device": "ios|android|web", "page": "/p/<n>"}; some nest "utm", some have
--     "device": null, some have no device key at all

CREATE SCHEMA gen;
CREATE FUNCTION gen.pick(i int, salt int, m int) RETURNS int
  LANGUAGE sql IMMUTABLE STRICT
  RETURN ((hashint4(i * 977 + salt)::bigint + 2147483648) % m)::int;
CREATE FUNCTION gen.u(i int, salt int) RETURNS float8
  LANGUAGE sql IMMUTABLE STRICT
  RETURN (hashint4(i * 977 + salt)::bigint + 2147483648) / 4294967296.0;

INSERT INTO events (id, user_id, kind, occurred_at, amount, props)
WITH raw AS (
  -- 91 days = 7,862,400 s spread over 25,000 events, plus jitter smaller than the step
  SELECT i,
         (i - 1)::bigint * 7862400 / 25000 + gen.pick(i, 81, 314) AS t,
         1 + floor(500 * gen.u(i, 82) * gen.u(i, 82))::int AS uid
  FROM generate_series(1, 25000) AS i
),
dayed AS (
  SELECT i, t, t / 86400 AS day, CASE WHEN uid = 17 THEN 18 ELSE uid END AS uid FROM raw
),
streak AS (
  SELECT i, t, day,
         CASE WHEN day BETWEEN 50 AND 79 AND day <> 64 AND row_number() OVER (PARTITION BY day ORDER BY i) = 1
              THEN 17 ELSE uid END AS user_id
  FROM dayed
),
firsts AS (
  SELECT *, row_number() OVER (PARTITION BY user_id ORDER BY i) = 1 AS first FROM streak
)
SELECT f.i,
       f.user_id,
       k.kind,
       timestamptz '2026-03-01 00:00:00+00' + f.t * interval '1 second'
         + CASE WHEN f.day >= 44 THEN interval '1 day' ELSE interval '0 days' END,
       CASE WHEN k.kind = 'purchase' THEN (500 + gen.pick(f.i, 83, 19500))::numeric / 100 END,
       CASE
         WHEN gen.pick(f.i, 87, 100) < 3 THEN jsonb_build_object('device', NULL, 'page', p.page)
         WHEN gen.pick(f.i, 87, 100) < 6 THEN jsonb_build_object('page', p.page)
         WHEN gen.pick(f.i, 87, 100) < 16 THEN jsonb_build_object('device', p.device, 'page', p.page,
           'utm', jsonb_build_object('source', (ARRAY['newsletter', 'search', 'social'])[1 + gen.pick(f.i, 88, 3)], 'campaign', 'spring'))
         ELSE jsonb_build_object('device', p.device, 'page', p.page)
       END
FROM firsts AS f
CROSS JOIN LATERAL (SELECT CASE
                             WHEN f.first THEN 'signup'
                             WHEN gen.pick(f.i, 84, 100) < 62 THEN 'view'
                             WHEN gen.pick(f.i, 84, 100) < 82 THEN 'click'
                             WHEN gen.pick(f.i, 84, 100) < 93 THEN 'add_to_cart'
                             ELSE 'purchase'
                           END AS kind) AS k
CROSS JOIN LATERAL (SELECT (ARRAY['ios', 'android', 'web'])[1 + gen.pick(f.i, 85, 3)] AS device,
                           '/p/' || (1 + gen.pick(f.i, 86, 200)) AS page) AS p
ORDER BY f.i;

ALTER TABLE events ALTER COLUMN id RESTART WITH 25001;

DROP SCHEMA gen CASCADE;
