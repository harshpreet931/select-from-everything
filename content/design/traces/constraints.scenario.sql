-- @title one table, five rules, and the row each one turns away
-- @engine pglite
-- @each

-- constraints reads these for two RunPicks: the violations, and the position swap under three kinds of UNIQUE.

-- @step T1 "a products table with a rule on every column that needs one."
CREATE TABLE products (
  id    int  PRIMARY KEY,
  sku   text NOT NULL UNIQUE,
  name  text NOT NULL,
  price numeric(8,2) NOT NULL CHECK (price >= 0),
  gtin  text UNIQUE,
  shelf text UNIQUE NULLS NOT DISTINCT
);
INSERT INTO products VALUES (1, 'TEA-01', 'assam tea', 6.50, NULL, NULL);

-- @step T1 errors=23502 "a product with no name. NOT NULL turns it away: 23502."
INSERT INTO products VALUES (2, 'TEA-02', NULL, 5.00, NULL, 'A1');

-- @step T1 errors=23514 "a negative price. the CHECK is false for this row: 23514."
INSERT INTO products VALUES (2, 'TEA-02', 'green tea', -5.00, NULL, 'A1');

-- @step T1 errors=23505 "a sku that's taken. UNIQUE finds it in its index: 23505."
INSERT INTO products VALUES (2, 'TEA-01', 'green tea', 5.00, NULL, 'A1');

-- @step T1 "a second product with no gtin. plain UNIQUE treats NULLs as distinct, so two NULLs are fine."
INSERT INTO products VALUES (2, 'TEA-02', 'green tea', 5.00, NULL, 'A1');

-- @step T1 "the table now."
SELECT id, sku, gtin, shelf FROM products ORDER BY id;

-- @step T1 errors=23505 "shelf is UNIQUE NULLS NOT DISTINCT: Assam already has a NULL shelf, so a second NULL is a duplicate."
INSERT INTO products VALUES (3, 'MUG-01', 'blue mug', 9.00, NULL, NULL);

-- @step T1 "a playlist with positions, unique per playlist. three kinds of UNIQUE, one shift."
CREATE TABLE plain (pos int UNIQUE, song text);
CREATE TABLE later (pos int UNIQUE DEFERRABLE, song text);
CREATE TABLE deferred (pos int UNIQUE DEFERRABLE INITIALLY DEFERRED, song text);
INSERT INTO plain VALUES (1, 'intro'), (2, 'verse'), (3, 'outro');
INSERT INTO later VALUES (1, 'intro'), (2, 'verse'), (3, 'outro');
INSERT INTO deferred VALUES (1, 'intro'), (2, 'verse'), (3, 'outro');

-- @step T1 errors=23505 "plain UNIQUE is checked row by row. moving 1 to 2 collides with the 2 that hasn't moved yet."
UPDATE plain SET pos = pos + 1;

-- @step T1 "DEFERRABLE (initially immediate) is checked at the end of the statement, when every row has moved. no collision."
UPDATE later SET pos = pos + 1;

-- @step T1 "the result."
SELECT pos, song FROM later ORDER BY pos;

-- @step T1 "INITIALLY DEFERRED waits until COMMIT. in between, a transaction can hold duplicates."
BEGIN;
UPDATE deferred SET pos = 2 WHERE song = 'intro';
SELECT pos, song FROM deferred ORDER BY pos, song;

-- @step T1 errors=23505 "and if they're still duplicates at COMMIT, the COMMIT fails and the whole transaction rolls back."
COMMIT;

-- @step T1 "back where it started."
SELECT pos, song FROM deferred ORDER BY pos;
