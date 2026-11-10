-- @title RETURNING old and new from every kind of write, an upsert that says what it did, and rows moved in one statement
-- @engine pglite
-- @db shop
-- @each

-- the figures on writes/returning-old-and-new read these. each write is wrapped in BEGIN and
-- ROLLBACK, so every one starts from the same shop.

-- @step T1 "a transaction to undo it in."
BEGIN;

-- @step T1 "INSERT: there was no row before, so every old column is NULL."
INSERT INTO products (sku, name, category, price)
VALUES ('BOO-0201', 'the sql cookbook', 'books', 24.00)
RETURNING old.sku AS old_sku, old.price AS old_price,
          new.sku AS new_sku, new.price AS new_price;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "UPDATE: both sides. old is the row before this statement touched it, new is what it wrote."
UPDATE products SET price = round(price * 1.10, 2)
WHERE category = 'books' AND price < 40
RETURNING old.sku AS old_sku, old.price AS old_price,
          new.sku AS new_sku, new.price AS new_price;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "DELETE: there is no row after, so every new column is NULL. the left-handed teapot, gone."
DELETE FROM products WHERE name = 'left-handed teapot'
RETURNING old.sku AS old_sku, old.price AS old_price,
          new.sku AS new_sku, new.price AS new_price;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "MERGE: one statement, two kinds of write. merge_action() says which, and old and new follow the same rules row by row."
MERGE INTO products AS p
USING (VALUES ('BOO-0028', 17.50, 'bamboo cookbook'),
              ('BOO-0203', 21.00, 'joins for cats')) AS f (sku, price, name)
ON p.sku = f.sku
WHEN MATCHED THEN UPDATE SET price = f.price
WHEN NOT MATCHED THEN INSERT (sku, name, category, price)
                      VALUES (f.sku, f.name, 'books', f.price)
RETURNING merge_action() AS action,
          old.sku AS old_sku, old.price AS old_price,
          new.sku AS new_sku, new.price AS new_price;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "an upsert with two rows: one sku exists, one doesn't. old.sku IS NULL tells them apart."
INSERT INTO products (sku, name, category, price)
VALUES ('BOO-0003', 'the art of sql', 'books', 30.00),
       ('BOO-0202', 'sql antipatterns', 'books', 38.00)
ON CONFLICT (sku) DO UPDATE SET price = EXCLUDED.price
RETURNING new.sku, old.price AS old_price, new.price AS new_price,
          old.sku IS NULL AS inserted;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "an archive table, shaped like orders."
CREATE TABLE orders_archive (LIKE orders);

-- @step T1 "before: 10,000 orders, an empty archive."
SELECT 'orders' AS tbl, count(*) AS n FROM orders
UNION ALL
SELECT 'orders_archive', count(*) FROM orders_archive
ORDER BY tbl;

-- @step T1 "one statement: DELETE hands its rows to the INSERT through RETURNING. both happen, or neither does."
WITH gone AS (
  DELETE FROM orders WHERE status = 'cancelled'
  RETURNING *
)
INSERT INTO orders_archive SELECT * FROM gone;

-- @step T1 "after: 317 orders moved."
SELECT 'orders' AS tbl, count(*) AS n FROM orders
UNION ALL
SELECT 'orders_archive', count(*) FROM orders_archive
ORDER BY tbl;
