-- @title NULL and three-valued logic: the truth tables, from postgres itself
-- @engine pglite
-- @each

-- @setup
CREATE TABLE u (x int UNIQUE);
INSERT INTO u VALUES (NULL), (NULL);

-- every figure on the null page reads one of these results, so what it draws is what postgres
-- answered, not a table typed in by hand. each one is a single SELECT over a VALUES list.

-- @step T1 "the five cities on the gate: London, Paris, an empty string, Lagos and NULL, against every condition and its NOT."
SELECT v.n, v.city,
       v.city = 'London' AS "eq", NOT (v.city = 'London') AS "not eq",
       v.city <> 'London' AS "ne", NOT (v.city <> 'London') AS "not ne",
       v.city = NULL AS "eqnull", NOT (v.city = NULL) AS "not eqnull",
       v.city IS NULL AS "isnull", NOT (v.city IS NULL) AS "not isnull",
       v.city IS DISTINCT FROM 'London' AS "distinct", NOT (v.city IS DISTINCT FROM 'London') AS "not distinct",
       v.city IN ('London', 'Paris') AS "in", NOT (v.city IN ('London', 'Paris')) AS "not in",
       v.city NOT IN ('London', NULL) AS "notinnull", NOT (v.city NOT IN ('London', NULL)) AS "not notinnull"
FROM (VALUES (1, 'London'), (2, 'Paris'), (3, ''), (4, 'Lagos'), (5, NULL)) AS v (n, city)
ORDER BY v.n;

-- @step T1 "AND, OR and NOT over true, false and unknown: every combination."
SELECT a, b, a AND b AS "a AND b", a OR b AS "a OR b", NOT a AS "NOT a"
FROM (VALUES (1, true), (2, false), (3, NULL)) AS x (i, a)
CROSS JOIN (VALUES (1, true), (2, false), (3, NULL)) AS y (j, b)
ORDER BY i, j;

-- @step T1 "two NULLs, asked whether they're the same, in nine places. u is a table with a UNIQUE column that took two NULLs without complaint."
SELECT n, place, verdict FROM (VALUES
  (1, 'NULL = NULL', coalesce((NULL::int = NULL::int)::text, 'unknown')),
  (2, 'NULL <> NULL', coalesce((NULL::int <> NULL::int)::text, 'unknown')),
  (3, 'NULL IS NOT DISTINCT FROM NULL', (NULL::int IS NOT DISTINCT FROM NULL::int)::text),
  (4, 'GROUP BY', (SELECT count(*) FROM (SELECT x FROM (VALUES (NULL::int), (NULL)) AS t (x) GROUP BY x) AS g)::text || ' bucket'),
  (5, 'SELECT DISTINCT', (SELECT count(*) FROM (SELECT DISTINCT x FROM (VALUES (NULL::int), (NULL)) AS t (x)) AS d)::text || ' row'),
  (6, 'UNION', (SELECT count(*) FROM (SELECT NULL::int UNION SELECT NULL::int) AS u)::text || ' row'),
  (7, 'count(DISTINCT x)', (SELECT count(DISTINCT x) FROM (VALUES (NULL::int), (NULL)) AS t (x))::text || ' values'),
  (8, 'ORDER BY x', (SELECT string_agg(coalesce(x::text, 'null'), ', ' ORDER BY x) FROM (VALUES (NULL::int), (2), (NULL), (1)) AS t (x))),
  (9, 'a UNIQUE column', (SELECT count(*) FROM u WHERE x IS NULL)::text || ' NULLs stored')
) AS s (n, place, verdict)
ORDER BY n;
