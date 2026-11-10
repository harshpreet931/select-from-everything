-- @title SELECT as a map: four products in, four rows out, plus number types and row widths
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "what FROM hands SELECT: four products, with the columns the select list reads."
SELECT id, name, category, price
FROM products
WHERE id IN (1, 5, 7, 200)
ORDER BY id;

-- @step T1 "what SELECT hands on: one output row per input row, one column per item in the list."
SELECT name, price * 1.2 AS gross, upper(category) AS shelf, price > 50 AS pricey, 'EUR' AS currency
FROM products
WHERE id IN (1, 5, 7, 200)
ORDER BY id;

-- @step T1 "two integers make an integer, and integer division throws the remainder away: 3, not 3.5."
SELECT 7 / 2 AS result, pg_typeof(7 / 2) AS type;

-- @step T1 "2.0 is a numeric, so the division is numeric too, and keeps its decimals."
SELECT 7 / 2.0 AS result, pg_typeof(7 / 2.0) AS type;

-- @step T1 "casting one side is enough: numeric divided by integer is numeric."
SELECT 7::numeric / 2 AS result, pg_typeof(7::numeric / 2) AS type;

-- @step T1 "a float8 is a binary floating-point number: fast, and fine for 3.5, but not for money (types has why)."
SELECT 7::float8 / 2 AS result, pg_typeof(7::float8 / 2) AS type;

-- @step T1 "left to right: 1 / 3 is 0 in integers, and 0 * 3 is 0. the order of operations decides what you lose."
SELECT 1 / 3 * 3 AS result, pg_typeof(1 / 3 * 3) AS type;

-- @step T1 "every product written out as text: all nine columns, then just three."
SELECT 'SELECT *' AS query, sum(octet_length(p::text)) AS bytes FROM products AS p
UNION ALL
SELECT 'SELECT id, name, price', sum(octet_length((p.id, p.name, p.price)::text)) FROM products AS p;
