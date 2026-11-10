-- @title one WHERE on events.user_id, many values: the planner's row estimate next to the real count
-- @engine pglite
-- @db events
-- @each

-- estimating-rows reads this file. step 0 is everything the planner knows about user_id
-- (pg_stats, unabridged) and the table's row count; step 1 sweeps user_id = v and user_id < v,
-- and the same two on the expression user_id + 0 (which has no statistics), over a set of
-- values, keeping EXPLAIN's estimated rows and the real count for each.

-- @setup
CREATE FUNCTION est(q text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE j json;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || q INTO j;
  RETURN (j->0->'Plan'->>'Plan Rows')::bigint;
END $$;
CREATE FUNCTION act(q text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || q || ') AS s' INTO n;
  RETURN n;
END $$;

-- @step T1 "what ANALYZE wrote down about events.user_id, and how many rows events has."
SELECT s.null_frac, s.n_distinct,
       s.most_common_vals::text AS mcv, s.most_common_freqs::text AS freqs,
       s.histogram_bounds::text AS bounds,
       c.reltuples::int AS reltuples
FROM pg_stats AS s JOIN pg_class AS c ON c.relname = s.tablename
WHERE s.tablename = 'events' AND s.attname = 'user_id';

-- @step T1 "every predicate in the figure: the planner's estimate and the real count."
SELECT op, v,
       est(format('SELECT * FROM events WHERE %s %s', op, v)) AS est,
       act(format('SELECT * FROM events WHERE %s %s', op, v)) AS actual
FROM unnest(ARRAY['user_id =', 'user_id <', 'user_id + 0 =', 'user_id + 0 <']) WITH ORDINALITY AS o(op, k),
     unnest(ARRAY[1, 2, 3, 4, 5, 8, 12, 17, 18, 25, 42, 60, 83, 84, 99, 120, 136, 150, 166, 175,
                  200, 225, 250, 275, 300, 333, 350, 400, 425, 450, 475, 499, 500, 501, 520]) AS v
ORDER BY k, v;

-- @step T1 "predicates combined: AND multiplies selectivities, OR adds them and takes the overlap out once."
SELECT q AS predicate,
       est(format('SELECT * FROM events WHERE %s', q)) AS est,
       act(format('SELECT * FROM events WHERE %s', q)) AS actual
FROM unnest(ARRAY[
  'kind = ''purchase''',
  'user_id < 42',
  'kind = ''purchase'' AND user_id < 42',
  'kind = ''purchase'' OR user_id < 42',
  'NOT kind = ''purchase''',
  'kind = ''signup'' AND user_id = 1'
]) WITH ORDINALITY AS t(q, k)
ORDER BY k;

-- @step T1 "predicates the statistics don't cover, and the constant each one falls back to."
SELECT q AS predicate,
       est(format('SELECT * FROM events WHERE %s', q)) AS est,
       act(format('SELECT * FROM events WHERE %s', q)) AS actual
FROM unnest(ARRAY[
  'lower(kind) = ''view''',
  'props->>''device'' = ''ios''',
  'user_id + 0 < 42',
  'user_id + 0 BETWEEN 100 AND 110',
  'user_id BETWEEN 100 AND 110',
  'amount IS NULL'
]) WITH ORDINALITY AS t(q, k)
ORDER BY k;
