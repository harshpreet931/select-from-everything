-- @title the WHERE you forgot, UPDATE ... FROM with a duplicate, and DELETE vs TRUNCATE
-- @engine pglite
-- @db shop
-- @each

-- the figures on writes/update-and-delete read these. every change is wrapped in BEGIN and
-- ROLLBACK, so each one starts from the same shop.

-- @step T1 "seven customers, a window into a table of 2,000."
SELECT id, name, city FROM customers WHERE id <= 6 OR id = 42 ORDER BY id;

-- @step T1 "how many customers there are."
SELECT count(*) FROM customers;

-- @step T1 "BEGIN first."
BEGIN;

-- @step T1 "with a WHERE: one row matches, one row changes. Ada moves to Paris."
UPDATE customers SET city = 'Paris' WHERE id = 42;

-- @step T1 "the window after it."
SELECT id, name, city FROM customers WHERE id <= 6 OR id = 42 ORDER BY id;

-- @step T1 "ROLLBACK: as if it never happened."
ROLLBACK;

-- @step T1 "the window after it."
SELECT id, name, city FROM customers WHERE id <= 6 OR id = 42 ORDER BY id;

-- @step T1 "BEGIN again."
BEGIN;

-- @step T1 "the same UPDATE without its WHERE. every row matches, so every customer now lives in Paris. Zoë already did, and she's counted anyway: UPDATE counts rows it wrote, not rows that changed."
UPDATE customers SET city = 'Paris';

-- @step T1 "the window after it."
SELECT id, name, city FROM customers WHERE id <= 6 OR id = 42 ORDER BY id;

-- @step T1 "UPDATE 2000 instead of UPDATE 1. that number is your one chance to notice. ROLLBACK, and nothing happened."
ROLLBACK;

-- @step T1 "the window after it."
SELECT id, name, city FROM customers WHERE id <= 6 OR id = 42 ORDER BY id;

-- @step T1 "a price feed for UPDATE ... FROM."
BEGIN;

-- @step T1 "one feed row per sku: each book gets its new price."
UPDATE products AS p
SET price = f.price
FROM (VALUES ('BOO-0003', 29.00), ('BOO-0028', 15.50)) AS f (sku, price)
WHERE p.sku = f.sku
RETURNING p.sku, p.name, p.price;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "two feed rows for the same sku. no error: postgres updates the art of sql once, with one of the two prices, and doesn't promise which."
UPDATE products AS p
SET price = f.price
FROM (VALUES ('BOO-0003', 29.00), ('BOO-0003', 35.00), ('BOO-0028', 15.50)) AS f (sku, price)
WHERE p.sku = f.sku
RETURNING p.sku, p.name, p.price;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "MERGE with the clean feed does the same job."
MERGE INTO products AS p
USING (VALUES ('BOO-0003', 29.00), ('BOO-0028', 15.50)) AS f (sku, price)
ON p.sku = f.sku
WHEN MATCHED THEN UPDATE SET price = f.price
RETURNING p.sku, p.name, p.price;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 errors=21000 "MERGE with the duplicate refuses: a target row may be changed at most once per statement, so two prices for one book is an error, not a coin toss."
MERGE INTO products AS p
USING (VALUES ('BOO-0003', 29.00), ('BOO-0003', 35.00), ('BOO-0028', 15.50)) AS f (sku, price)
ON p.sku = f.sku
WHEN MATCHED THEN UPDATE SET price = f.price
RETURNING p.sku, p.name, p.price;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "order_items before anything: 24,942 rows in 1.3 MB, in the file named by its filenode."
SELECT count(*) AS rows, pg_relation_size('order_items') AS bytes, pg_relation_filenode('order_items') AS filenode FROM order_items;

-- @step T1 "a transaction to undo it in."
BEGIN;

-- @step T1 "DELETE every row."
DELETE FROM order_items;

-- @step T1 "zero rows, and the file is exactly as big as before. every row is still on its page, marked deleted, until VACUUM clears it."
SELECT count(*) AS rows, pg_relation_size('order_items') AS bytes, pg_relation_filenode('order_items') AS filenode FROM order_items;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "TRUNCATE instead."
TRUNCATE order_items;

-- @step T1 "zero rows in zero bytes, and a different filenode: TRUNCATE didn't touch a single row, it swapped in a brand new empty file."
SELECT count(*) AS rows, pg_relation_size('order_items') AS bytes, pg_relation_filenode('order_items') AS filenode FROM order_items;

-- @step T1 "undo. even TRUNCATE rolls back in postgres."
ROLLBACK;
