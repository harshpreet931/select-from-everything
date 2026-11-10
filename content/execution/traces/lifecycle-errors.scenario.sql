-- @title one mistake per stage: where each kind of error is caught
-- @engine pglite
-- @db shop
-- @each

-- @step T1 errors=42601 "the parser: FORM isn't a keyword, so it reads as a column alias (AS is optional), and the grammar only gets stuck one word later, at customers."
SELECT name FORM customers WHERE id = 42;

-- @step T1 errors=42P01 "the analyzer: the grammar is fine, but there's no relation called custmers in the catalog."
SELECT name FROM custmers WHERE id = 42;

-- @step T1 errors=42703 "the analyzer again: the table exists, the column does not."
SELECT nmae FROM customers WHERE id = 42;

-- @step T1 errors=0A000 "the planner: the query is valid, but no join method it has can run a FULL JOIN on <."
SELECT c.name, o.id FROM customers AS c FULL JOIN orders AS o ON o.customer_id < c.id;

-- @step T1 errors=22012 "the executor: everything checks out until a row actually arrives with id = 42, and 1 / 0 is computed."
SELECT name, 1 / (id - 42) AS oops FROM customers WHERE id = 42;

-- @step T1 "and the one that works."
SELECT name FROM customers WHERE id = 42;
