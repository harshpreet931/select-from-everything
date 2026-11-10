-- @title a login lookup built by gluing strings, and the same one with a bound parameter
-- @engine pglite
-- @db shop
-- @each

-- the injection figure on writes/parameters-and-injection reads these: for each input it tries,
-- what postgres did with the glued sql (a count of the rows the app would get back, or the error)
-- and with the same input bound as $1. the glued text is exactly what string concatenation
-- produces; the count wraps it on lines of its own, so a -- comment in it ends at the newline.

-- @step T1 "glued, with an ordinary email: one row, Ada."
SELECT count(*) AS rows FROM (
SELECT id, name FROM customers WHERE email = 'ada@example.com' ORDER BY id
) AS app_query;

-- @step T1 "glued, with ' OR 1=1 --: the quote closes the string, OR 1=1 is true for every row, and -- turns the rest into a comment. every customer."
SELECT count(*) AS rows FROM (
SELECT id, name FROM customers WHERE email = '' OR 1=1 --' ORDER BY id
) AS app_query;

-- @step T1 errors=2BP01 "glued, with '; DROP TABLE customers; --: two statements. the first finds nobody, then DROP TABLE runs, and fails only because orders still points at customers."
SELECT id, name FROM customers WHERE email = ''; DROP TABLE customers; --' ORDER BY id;

-- @step T1 "the bound version: the sql is fixed, and $1 is a slot for one text value."
PREPARE login(text) AS
SELECT id, name FROM customers WHERE email = $1 ORDER BY id;

-- @step T1 "bound, with an ordinary email: one row, Ada."
EXECUTE login('ada@example.com');

-- @step T1 "bound, with ' OR 1=1 --: nobody's email is literally that, so no rows."
EXECUTE login(''' OR 1=1 --');

-- @step T1 "bound, with '; DROP TABLE customers; --: still just an odd email address. no rows, nothing dropped."
EXECUTE login('''; DROP TABLE customers; --');

-- @step T1 "identifiers can't be parameters, so they get quoted instead. %s pastes text as is, %I quotes it as an identifier when it needs quoting, %L as a literal."
SELECT input,
       format('%s', input) AS "%s",
       format('%I', input) AS "%I",
       format('%L', input) AS "%L"
FROM (VALUES (1, 'customers'), (2, 'Customers'), (3, 'order items'), (4, 'select'),
             (5, 'x"; DROP TABLE orders; --'), (6, 'O''Neil')) AS t (n, input)
ORDER BY n;
