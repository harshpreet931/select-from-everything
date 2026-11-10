-- @title a boolean's three values under five tests, an enum before and after ADD VALUE, and where a domain's CHECK fires
-- @engine pglite
-- @each

-- the truth table, the enum switch and the domain switch on types/booleans-enums-domains read this.

-- @step T1 "true, false and NULL, each under = true, IS TRUE, IS NOT TRUE, NOT and IS NOT FALSE."
SELECT x, x = true AS "x = true", x IS TRUE AS "x IS TRUE", x IS NOT TRUE AS "x IS NOT TRUE", NOT x AS "NOT x", x IS NOT FALSE AS "x IS NOT FALSE"
FROM (VALUES (1, true), (2, false), (3, NULL::boolean)) AS v (n, x)
ORDER BY n;

-- @step T1 "an enum with four labels. each gets a sort position, in the order they were written."
CREATE TYPE order_status AS ENUM ('placed', 'paid', 'shipped', 'delivered');
SELECT enumlabel AS label, enumsortorder AS sort_position
FROM pg_enum WHERE enumtypid = 'order_status'::regtype
ORDER BY enumsortorder;

-- @step T1 "three new labels: one at the end, one between paid and shipped, one between delivered and cancelled."
ALTER TYPE order_status ADD VALUE 'cancelled';
ALTER TYPE order_status ADD VALUE 'packed' BEFORE 'shipped';
ALTER TYPE order_status ADD VALUE 'returned' AFTER 'delivered';
SELECT enumlabel AS label, enumsortorder AS sort_position
FROM pg_enum WHERE enumtypid = 'order_status'::regtype
ORDER BY enumsortorder;

-- @step T1 "a domain: text, plus a CHECK that it looks like an email. and a table and a function that use it."
CREATE DOMAIN email AS text CHECK (VALUE ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
CREATE TABLE subscribers (id int PRIMARY KEY, address email);
INSERT INTO subscribers VALUES (1, 'ada@example.com');
CREATE FUNCTION welcome(e email) RETURNS text LANGUAGE sql RETURN 'hello, ' || e;

-- @step T1 errors=23514 "a cast to the domain checks the value."
SELECT 'not an email'::email;

-- @step T1 errors=23514 "storing into a domain column checks it."
INSERT INTO subscribers VALUES (2, 'not an email');

-- @step T1 errors=23514 "so does changing one."
UPDATE subscribers SET address = 'not an email' WHERE id = 1;

-- @step T1 errors=23514 "passing it to a function that takes the domain checks it too."
SELECT welcome('not an email');

-- @step T1 "a NULL passes: a CHECK only rejects false, and NULL is unknown. say NOT NULL in the domain if it must be there."
INSERT INTO subscribers VALUES (3, NULL) RETURNING id, address;
