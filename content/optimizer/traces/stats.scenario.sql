-- @title what ANALYZE wrote down about four columns of events, and what goes stale when rows arrive
-- @engine pglite
-- @db events
-- @each

-- statistics reads this file. steps 0-3 are one pg_stats row each, turned on its side (one
-- line per statistic) so it fits a phone; step 4 is kind's most common values; steps 5-9 add
-- 4,000 signups and compare the estimate for kind = 'signup' before and after ANALYZE.

-- @setup
CREATE FUNCTION card(col text) RETURNS TABLE (stat text, value text) LANGUAGE sql AS $$
  SELECT x.stat, x.value
  FROM pg_stats AS s,
       LATERAL (VALUES
         (1, 'null_frac', s.null_frac::text),
         (2, 'n_distinct', s.n_distinct::text),
         (3, 'most_common_vals', coalesce(array_length(s.most_common_freqs, 1) || ' values, from ' || (s.most_common_vals::text::text[])[1], 'none')),
         (4, 'most_common_freqs', coalesce(array_to_string(s.most_common_freqs[1:3], ', ') || CASE WHEN array_length(s.most_common_freqs, 1) > 3 THEN ', …' ELSE '' END, 'none')),
         (5, 'histogram_bounds', coalesce(array_length(s.histogram_bounds::text::text[], 1) || ' bounds, ' || (s.histogram_bounds::text::text[])[1] || ' … ' || (s.histogram_bounds::text::text[])[array_length(s.histogram_bounds::text::text[], 1)], 'none')),
         (6, 'correlation', s.correlation::text),
         (7, 'avg_width', s.avg_width::text)
       ) AS x(k, stat, value)
  WHERE s.tablename = 'events' AND s.attname = col
  ORDER BY x.k
$$;

-- @step T1 "kind: five values, all of them common, so a full list of frequencies and no histogram."
SELECT * FROM card('kind');
-- @step T1 "amount: only purchases have one, so 93% of the rows are NULL."
SELECT * FROM card('amount');
-- @step T1 "user_id: 500 users, skewed. the busiest 100 in the MCV list, the rest in a histogram."
SELECT * FROM card('user_id');
-- @step T1 "occurred_at: every value distinct (n_distinct = -1), stored in time order (correlation 1)."
SELECT * FROM card('occurred_at');

-- @step T1 "kind's most common values and their frequencies."
SELECT v AS kind, f AS freq
FROM pg_stats, unnest(most_common_vals::text::text[], most_common_freqs) AS u(v, f)
WHERE tablename = 'events' AND attname = 'kind'
ORDER BY f DESC;

-- @step T1 "4,000 signups arrive. nobody runs ANALYZE."
INSERT INTO events (user_id, kind, occurred_at)
SELECT 1 + i % 500, 'signup', timestamptz '2026-06-01 00:00+00' + i * interval '1 minute'
FROM generate_series(1, 4000) AS i
ORDER BY i;
-- @explain T1 noanalyze "the estimate still uses the old 2% for signup, times the table's new size."
SELECT * FROM events WHERE kind = 'signup';
-- @step T1 "the real count."
SELECT count(*) FROM events WHERE kind = 'signup';
-- @step T1 "ANALYZE reads the table again."
ANALYZE events;
-- @explain T1 noanalyze "now the estimate knows."
SELECT * FROM events WHERE kind = 'signup';
