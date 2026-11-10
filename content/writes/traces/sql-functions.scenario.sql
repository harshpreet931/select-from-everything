-- @title one small sql function declared five ways, three volatilities, and two kinds of body
-- @engine pglite
-- @db shop
-- @each

-- the switches on writes/sql-functions read these: the same query planned around is_cheap()
-- declared five ways, call counts for VOLATILE / STABLE / IMMUTABLE, and what a string body and
-- a BEGIN ATOMIC body do when the column they use is renamed or dropped.

-- @step T1 "an index on unit_price, so a plan can use one."
CREATE INDEX ON order_items (unit_price);

-- @step T1 "a plain LANGUAGE sql function: one expression, nothing else."
CREATE FUNCTION is_cheap(p numeric) RETURNS boolean
LANGUAGE sql
RETURN p < 5;

-- @step T1 "858 cheap line items."
SELECT count(*) FROM order_items WHERE is_cheap(unit_price);

-- @explain T1 "inlined: the planner pasted p < 5 into the query, saw unit_price < 5, and used the index."
SELECT count(*) FROM order_items WHERE is_cheap(unit_price);

-- @step T1 "the same function, declared VOLATILE."
CREATE OR REPLACE FUNCTION is_cheap(p numeric) RETURNS boolean
LANGUAGE sql VOLATILE
RETURN p < 5;

-- @step T1 "same answer."
SELECT count(*) FROM order_items WHERE is_cheap(unit_price);

-- @explain T1 "still inlined: a one-expression function in WHERE is inlined even when it says VOLATILE, as long as its body is no more volatile than it claims."
SELECT count(*) FROM order_items WHERE is_cheap(unit_price);

-- @step T1 "SECURITY DEFINER: the body runs as the function's owner."
CREATE OR REPLACE FUNCTION is_cheap(p numeric) RETURNS boolean
LANGUAGE sql SECURITY DEFINER
RETURN p < 5;

-- @step T1 "same answer."
SELECT count(*) FROM order_items WHERE is_cheap(unit_price);

-- @explain T1 "not inlined: switching user has to happen at call time, so the planner can't paste the body in. a seq scan calls is_cheap on every row."
SELECT count(*) FROM order_items WHERE is_cheap(unit_price);

-- @step T1 "a SET clause: the function runs with its own search_path."
CREATE OR REPLACE FUNCTION is_cheap(p numeric) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = public
RETURN p < 5;

-- @step T1 "same answer."
SELECT count(*) FROM order_items WHERE is_cheap(unit_price);

-- @explain T1 "not inlined either: a setting has to be switched for each call."
SELECT count(*) FROM order_items WHERE is_cheap(unit_price);

-- @step T1 "the same logic in PL/pgSQL."
CREATE OR REPLACE FUNCTION is_cheap(p numeric) RETURNS boolean
LANGUAGE plpgsql
AS $$ BEGIN RETURN p < 5; END $$;

-- @step T1 "same answer."
SELECT count(*) FROM order_items WHERE is_cheap(unit_price);

-- @explain T1 "never inlined: only LANGUAGE sql functions can be. to the planner, a PL/pgSQL function is a black box."
SELECT count(*) FROM order_items WHERE is_cheap(unit_price);

-- @step T1 "a sequence to count calls with, and three copies of one function that bumps it."
CREATE SEQUENCE calls;
CREATE FUNCTION pick_volatile(x int) RETURNS int LANGUAGE plpgsql VOLATILE
AS $$ BEGIN PERFORM nextval('calls'); RETURN x; END $$;
CREATE FUNCTION pick_stable(x int) RETURNS int LANGUAGE plpgsql STABLE
AS $$ BEGIN PERFORM nextval('calls'); RETURN x; END $$;
CREATE FUNCTION pick_immutable(x int) RETURNS int LANGUAGE plpgsql IMMUTABLE
AS $$ BEGIN PERFORM nextval('calls'); RETURN x; END $$;

-- @step T1 "VOLATILE: might return something different every time, so it's called for every row."
SELECT name FROM customers WHERE id = pick_volatile(42);

-- @step T1 "calls."
SELECT nextval('calls') - 1 AS calls;

-- @explain T1 noanalyze "a VOLATILE call can't be an index key: seq scan, function in the filter."
SELECT name FROM customers WHERE id = pick_volatile(42);

-- @step T1 "reset the count."
ALTER SEQUENCE calls RESTART;

-- @step T1 "STABLE: same result for the whole statement."
SELECT name FROM customers WHERE id = pick_stable(42);

-- @step T1 "calls."
SELECT nextval('calls') - 1 AS calls;

-- @explain T1 noanalyze "a STABLE call can be an index key: evaluated once when the scan starts."
SELECT name FROM customers WHERE id = pick_stable(42);

-- @step T1 "reset the count."
ALTER SEQUENCE calls RESTART;

-- @step T1 "IMMUTABLE: same result for the same input, forever."
SELECT name FROM customers WHERE id = pick_immutable(42);

-- @step T1 "calls."
SELECT nextval('calls') - 1 AS calls;

-- @explain T1 noanalyze "IMMUTABLE with a constant argument is folded while planning: the plan just says id = 42."
SELECT name FROM customers WHERE id = pick_immutable(42);

-- @step T1 "reset the count."
ALTER SEQUENCE calls RESTART;

-- @step T1 "a transaction to undo each variant in."
BEGIN;

-- @step T1 errors=42703 "a string body is stored as text. renaming the column it uses goes through, and the function breaks the next time it's called."
CREATE FUNCTION n_books() RETURNS bigint LANGUAGE sql
AS $$ SELECT count(*) FROM products WHERE category = 'books' $$;
ALTER TABLE products RENAME COLUMN category TO kind;
SELECT n_books();

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "a BEGIN ATOMIC body is parsed when it's created and stored as a tree that points at the column itself. rename the column, and the function keeps working."
CREATE FUNCTION n_books() RETURNS bigint LANGUAGE sql
BEGIN ATOMIC
  SELECT count(*) FROM products WHERE category = 'books';
END;
ALTER TABLE products RENAME COLUMN category TO kind;
SELECT n_books();

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 errors=42703 "drop the column under a string body, and postgres doesn't notice until the call."
CREATE FUNCTION n_books() RETURNS bigint LANGUAGE sql
AS $$ SELECT count(*) FROM products WHERE category = 'books' $$;
ALTER TABLE products DROP COLUMN category;
SELECT n_books();

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 errors=2BP01 "drop the column under a BEGIN ATOMIC body, and postgres refuses: the function depends on it."
CREATE FUNCTION n_books() RETURNS bigint LANGUAGE sql
BEGIN ATOMIC
  SELECT count(*) FROM products WHERE category = 'books';
END;
ALTER TABLE products DROP COLUMN category;
SELECT n_books();

-- @step T1 "undo."
ROLLBACK;
