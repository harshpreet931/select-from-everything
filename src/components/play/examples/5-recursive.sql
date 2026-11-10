-- @label recursive
-- @db org
-- everyone under employee 3, two levels down, with their depth
WITH RECURSIVE reports AS (
  SELECT id, name, title, manager_id, 0 AS depth
  FROM employees
  WHERE id = 3
  UNION ALL
  SELECT e.id, e.name, e.title, e.manager_id, r.depth + 1
  FROM employees AS e
  JOIN reports AS r ON e.manager_id = r.id
  WHERE r.depth < 2
)
SELECT depth, id, name, title
FROM reports
ORDER BY depth, id;
