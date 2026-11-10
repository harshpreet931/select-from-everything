-- @title who manages nobody: four ways to ask, one of them wrong
-- @engine pglite
-- @db org
-- @each

-- the switch on not-in-trap reads these. manager_id is NULL for the CEO, so the NOT IN list has
-- one NULL in it.

-- @step T1 "NOT IN: the CEO's NULL manager_id is in the list, so every id gets unknown. 0 rows."
SELECT count(*) AS manage_nobody
FROM employees AS e
WHERE e.id NOT IN (SELECT manager_id FROM employees);

-- @step T1 "NOT IN, with the NULLs filtered out of the subquery: the list has only real ids now. 200."
SELECT count(*) AS manage_nobody
FROM employees AS e
WHERE e.id NOT IN (SELECT manager_id FROM employees WHERE manager_id IS NOT NULL);

-- @step T1 "NOT EXISTS: is there an employee whose manager_id = e.id? the CEO's NULL just never matches. 200."
SELECT count(*) AS manage_nobody
FROM employees AS e
WHERE NOT EXISTS (SELECT 1 FROM employees AS r WHERE r.manager_id = e.id);

-- @step T1 "LEFT JOIN, keep the padded rows: employees nobody reports to. 200."
SELECT count(*) AS manage_nobody
FROM employees AS e
LEFT JOIN employees AS r ON r.manager_id = e.id
WHERE r.id IS NULL;
