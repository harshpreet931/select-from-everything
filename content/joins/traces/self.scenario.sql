-- @title the org chart joined to itself: managers, and pairs of vice presidents
-- @engine pglite
-- @db org
-- @each

-- the figures on self-and-cross-joins read these. vps is a copy of the three vice presidents,
-- so the grid stays 3 × 3.

-- @setup
CREATE TABLE vps AS SELECT id, name, salary FROM employees WHERE title = 'vp' ORDER BY id;

-- @step T1 "the left side of the self join: the first five employees, with their manager's id."
SELECT manager_id, name FROM employees WHERE id <= 5 ORDER BY id;

-- @step T1 "the right side: the same five employees, by id."
SELECT id, name FROM employees WHERE id <= 5 ORDER BY id;

-- @step T1 "the three vice presidents, the table the grid is drawn from."
SELECT id, name, salary FROM vps ORDER BY id;

-- @step T1 "ON true: every vp paired with every vp, themselves included. 3 × 3 = 9."
SELECT a.id, a.name, b.id, b.name FROM vps AS a JOIN vps AS b ON true ORDER BY a.id, b.id;

-- @step T1 "a.id <> b.id drops the diagonal, the pairs of a person with themselves. 6 left, and each pair is still there twice, once in each order."
SELECT a.id, a.name, b.id, b.name FROM vps AS a JOIN vps AS b ON a.id <> b.id ORDER BY a.id, b.id;

-- @step T1 "a.id < b.id keeps one half of the grid: every pair once, nobody with themselves. 3 pairs, n × (n - 1) / 2."
SELECT a.id, a.name, b.id, b.name FROM vps AS a JOIN vps AS b ON a.id < b.id ORDER BY a.id, b.id;

-- @step T1 "a.salary < b.salary: who earns less than whom. Olivia earns less than both others. Mei and Chen earn the same, so neither pair passes."
SELECT a.id, a.name, b.id, b.name FROM vps AS a JOIN vps AS b ON a.salary < b.salary ORDER BY a.id, b.id;
