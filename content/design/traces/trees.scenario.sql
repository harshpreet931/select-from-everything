-- @title the org chart stored four ways, one subtree query each, and the rows each one writes to add or move people
-- @engine pglite
-- @db org
-- @each

-- hierarchies reads these: the subtree RunPick (steps 3 to 6) and the write counts (the rest).

-- @step T1 "materialized path: each row stores the ids from the root down to itself."
CREATE TABLE emp_path AS
WITH RECURSIVE t AS (
  SELECT id, name, id::text AS path, ARRAY[id] AS ids FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, t.path || '.' || e.id, t.ids || e.id FROM employees AS e JOIN t ON e.manager_id = t.id
) SELECT id, name, path FROM t ORDER BY ids;

-- @step T1 "closure table: one row per (ancestor, descendant) pair, including each node with itself at depth 0."
CREATE TABLE emp_closure AS
WITH RECURSIVE c AS (
  SELECT id AS ancestor, id AS descendant, 0 AS depth FROM employees
  UNION ALL
  SELECT c.ancestor, e.id, c.depth + 1 FROM c JOIN employees AS e ON e.manager_id = c.descendant
) SELECT * FROM c ORDER BY ancestor, descendant;

-- @step T1 "nested sets: number the nodes in a depth-first walk; a subtree is everything between a node's lft and rgt."
CREATE TABLE emp_sets AS
WITH RECURSIVE t AS (
  SELECT id, ARRAY[id] AS ids, 0 AS depth FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, t.ids || e.id, t.depth + 1 FROM employees AS e JOIN t ON e.manager_id = t.id
), pre AS (SELECT id, depth, row_number() OVER (ORDER BY ids) AS p FROM t)
SELECT pre.id, (2 * p - depth - 1)::int AS lft,
       (2 * p - depth - 1 + 2 * (SELECT count(*) FROM emp_closure AS c WHERE c.ancestor = pre.id) - 1)::int AS rgt
FROM pre ORDER BY lft;

-- @step T1 "adjacency list: a recursive CTE walks down from Olivia Lopez (id 2), one level per round."
WITH RECURSIVE team AS (
  SELECT id, 1 AS depth FROM employees WHERE manager_id = 2
  UNION ALL
  SELECT e.id, team.depth + 1 FROM employees AS e JOIN team ON e.manager_id = team.id
)
SELECT count(*) AS reports, max(depth) AS levels FROM team;

-- @step T1 "materialized path: a prefix match. her path is 1.2, so her team is everything under 1.2."
SELECT count(*) AS reports, max(array_length(string_to_array(path, '.'), 1)) - 2 AS levels
FROM emp_path WHERE path LIKE '1.2.%';

-- @step T1 "nested sets: a range. everyone whose lft and rgt sit inside hers."
SELECT count(*) AS reports, NULL::int AS levels
FROM emp_sets AS c JOIN emp_sets AS boss ON boss.id = 2
WHERE c.lft > boss.lft AND c.rgt < boss.rgt;

-- @step T1 "closure table: the pairs are already stored. one index-friendly lookup."
SELECT count(*) AS reports, max(depth) AS levels
FROM emp_closure WHERE ancestor = 2 AND depth > 0;

-- @step T1 "adding someone under Rahul Singh (id 5), adjacency list: one row."
INSERT INTO employees (id, name, manager_id, dept_id, title, salary, hired_on)
VALUES (301, 'Ada Lovelace', 5, 2, 'engineer', 90000, '2026-03-02');

-- @step T1 "materialized path: one row, its path built from the parent's."
INSERT INTO emp_path SELECT 301, 'Ada Lovelace', path || '.301' FROM emp_path WHERE id = 5;

-- @step T1 "closure table: one row per ancestor, plus the node itself."
INSERT INTO emp_closure
SELECT ancestor, 301, depth + 1 FROM emp_closure WHERE descendant = 5
UNION ALL SELECT 301, 301, 0;

-- @step T1 "nested sets: make room. every rgt at or after the parent's moves up by 2."
UPDATE emp_sets SET rgt = rgt + 2 WHERE rgt >= (SELECT rgt FROM emp_sets WHERE id = 5);

-- @step T1 "and every lft after it."
UPDATE emp_sets SET lft = lft + 2 WHERE lft > (SELECT rgt - 2 FROM emp_sets WHERE id = 5);

-- @step T1 "then the row itself."
INSERT INTO emp_sets SELECT 301, rgt - 2, rgt - 1 FROM emp_sets WHERE id = 5;

-- @step T1 "moving Rahul Singh's whole team under Mei Dubois (id 3), adjacency list: one row."
UPDATE employees SET manager_id = 3 WHERE id = 5;

-- @step T1 "materialized path: every path in the moved subtree is rewritten."
UPDATE emp_path SET path = '1.3.5' || substr(path, length('1.2.5') + 1)
WHERE path = '1.2.5' OR path LIKE '1.2.5.%';

-- @step T1 "closure table: drop the pairs linking the subtree to its old ancestors."
DELETE FROM emp_closure AS c
WHERE c.descendant IN (SELECT descendant FROM emp_closure WHERE ancestor = 5)
  AND c.ancestor NOT IN (SELECT descendant FROM emp_closure WHERE ancestor = 5);

-- @step T1 "and add one pair per (new ancestor, subtree member)."
INSERT INTO emp_closure
SELECT up.ancestor, down.descendant, up.depth + down.depth + 1
FROM emp_closure AS up, emp_closure AS down
WHERE up.descendant = 3 AND down.ancestor = 5;

-- @step T1 "the subtree that moved."
SELECT count(*) AS people FROM emp_closure WHERE ancestor = 5;
