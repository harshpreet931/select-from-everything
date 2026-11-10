-- @title a recursive CTE walking down the org chart from one manager, an iteration at a time
-- @engine pglite
-- @db org
-- @each

-- the iteration stepper on recursive-ctes reads the @stages step: each stage is the whole
-- recursive query, run for real, filtered to one depth. depth goes up by one per iteration,
-- so the rows at depth n are iteration n's working table. the SEARCH switch reads the two
-- steps after it.

-- @stages T1 "Ama Rossi's team, walked one level per iteration."
WITH RECURSIVE team AS (
  SELECT id, name, title, 0 AS depth
  FROM employees
  WHERE id = 14
  UNION ALL
  SELECT e.id, e.name, e.title, t.depth + 1
  FROM employees AS e
  JOIN team AS t ON e.manager_id = t.id
)
SELECT id, name, title, depth FROM team ORDER BY depth, id;

-- @stage anchor "the anchor runs once: Ama Rossi, manager, employee 14. she is the whole working table, and the first row of the result."
WITH RECURSIVE team AS (
  SELECT id, name, title, 0 AS depth
  FROM employees
  WHERE id = 14
  UNION ALL
  SELECT e.id, e.name, e.title, t.depth + 1
  FROM employees AS e
  JOIN team AS t ON e.manager_id = t.id
)
SELECT id, name, title, depth FROM team WHERE depth = 0 ORDER BY id;

-- @stage iteration 1 "the recursive half joins employees to the working table, so it looks for people whose manager is Ama. three leads. they replace her as the working table, and join the result."
WITH RECURSIVE team AS (
  SELECT id, name, title, 0 AS depth
  FROM employees
  WHERE id = 14
  UNION ALL
  SELECT e.id, e.name, e.title, t.depth + 1
  FROM employees AS e
  JOIN team AS t ON e.manager_id = t.id
)
SELECT id, name, title, depth FROM team WHERE depth = 1 ORDER BY id;

-- @stage iteration 2 "same join, against the three leads only, not against everything found so far. nine associates."
WITH RECURSIVE team AS (
  SELECT id, name, title, 0 AS depth
  FROM employees
  WHERE id = 14
  UNION ALL
  SELECT e.id, e.name, e.title, t.depth + 1
  FROM employees AS e
  JOIN team AS t ON e.manager_id = t.id
)
SELECT id, name, title, depth FROM team WHERE depth = 2 ORDER BY id;

-- @stage iteration 3 "nobody reports to the nine associates. the join finds nothing, the working table is empty, and postgres stops. 13 rows in all."
WITH RECURSIVE team AS (
  SELECT id, name, title, 0 AS depth
  FROM employees
  WHERE id = 14
  UNION ALL
  SELECT e.id, e.name, e.title, t.depth + 1
  FROM employees AS e
  JOIN team AS t ON e.manager_id = t.id
)
SELECT id, name, title, depth FROM team WHERE depth = 3 ORDER BY id;

-- @step T1 "SEARCH BREADTH FIRST: a level at a time, like the iterations ran. ord is (depth, id) under the hood."
WITH RECURSIVE team AS (
  SELECT id, name, 0 AS depth
  FROM employees
  WHERE id = 14
  UNION ALL
  SELECT e.id, e.name, t.depth + 1
  FROM employees AS e
  JOIN team AS t ON e.manager_id = t.id
) SEARCH BREADTH FIRST BY id SET ord
SELECT id, name, depth, ord FROM team ORDER BY ord;

-- @step T1 "SEARCH DEPTH FIRST: down one branch to the bottom before the next. ord is the path of ids from the top, so sorting by it walks the tree."
WITH RECURSIVE team AS (
  SELECT id, name, 0 AS depth
  FROM employees
  WHERE id = 14
  UNION ALL
  SELECT e.id, e.name, t.depth + 1
  FROM employees AS e
  JOIN team AS t ON e.manager_id = t.id
) SEARCH DEPTH FIRST BY id SET ord
SELECT id, name, depth, ord FROM team ORDER BY ord;
