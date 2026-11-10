-- @title one join with the join methods switched off one by one
-- @engine pglite
-- @db shop
-- @each

-- steering-the-planner reads this file: for each set of enable_* switches, a step that sets them
-- (after a RESET) and then the plain text EXPLAIN of the same paris join.

-- @step T1 "nothing turned off: a hash join, the cheapest plan."
RESET ALL;
EXPLAIN
SELECT c.name, o.ordered_at
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris';

-- @step T1 "hash joins off: the next cheapest is a merge join, sorting both sides first."
RESET ALL;
SET enable_hashjoin = off;
EXPLAIN
SELECT c.name, o.ordered_at
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris';

-- @step T1 "merge joins off too: a nested loop, with a Memoize in front of the index on customers."
RESET ALL;
SET enable_hashjoin = off;
SET enable_mergejoin = off;
EXPLAIN
SELECT c.name, o.ordered_at
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris';

-- @step T1 "every join method off. postgres still has to join, so it picks the plan with the fewest disabled nodes, and says so: Disabled: true."
RESET ALL;
SET enable_hashjoin = off;
SET enable_mergejoin = off;
SET enable_nestloop = off;
EXPLAIN
SELECT c.name, o.ordered_at
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE c.city = 'Paris';

-- @step T1 "back to the defaults."
RESET ALL;
