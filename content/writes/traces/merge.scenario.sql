-- @title a supplier's book list merged into shop's products, clause by clause
-- @engine pglite
-- @db shop
-- @each

-- the figures on writes/merge read these. the feed is a small table built here: 8 of shop's 12
-- books (two with new prices), 2 books shop doesn't have, and 4 of shop's books left out.

-- @step T1 "the supplier's list."
CREATE TABLE feed (sku text PRIMARY KEY, name text NOT NULL, price numeric(10,2) NOT NULL);
INSERT INTO feed VALUES
  ('BOO-0003', 'the art of sql',     32.00),
  ('BOO-0028', 'bamboo cookbook',    17.50),
  ('BOO-0053', 'mini notebook',     153.60),
  ('BOO-0054', 'compact novel',      69.00),
  ('BOO-0060', 'travel field guide', 67.89),
  ('BOO-0097', 'deluxe notebook',   114.68),
  ('BOO-0120', 'large cookbook',     16.60),
  ('BOO-0142', 'deluxe cookbook',   128.41),
  ('BOO-0201', 'the sql cookbook',   24.00),
  ('BOO-0202', 'sql antipatterns',   38.00);

-- @step T1 "shop's books before the merge."
SELECT sku, name, price, discontinued FROM products WHERE category = 'books' ORDER BY sku;

-- @step T1 "a transaction, so each variant starts from the same books."
BEGIN;

-- @step T1 "only WHEN MATCHED: the two books whose price changed are updated. everything else is left alone."
MERGE INTO products AS p
USING feed AS f ON p.sku = f.sku
WHEN MATCHED AND p.price <> f.price THEN
  UPDATE SET price = f.price
RETURNING merge_action() AS action, p.sku, old.price AS old_price, new.price AS new_price, p.discontinued;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "add WHEN NOT MATCHED: the two books shop didn't have are inserted too."
MERGE INTO products AS p
USING feed AS f ON p.sku = f.sku
WHEN MATCHED AND p.price <> f.price THEN
  UPDATE SET price = f.price
WHEN NOT MATCHED THEN
  INSERT (sku, name, category, price) VALUES (f.sku, f.name, 'books', f.price)
RETURNING merge_action() AS action, p.sku, old.price AS old_price, new.price AS new_price, p.discontinued;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "add WHEN NOT MATCHED BY SOURCE, limited to books: the four books missing from the list are marked discontinued."
MERGE INTO products AS p
USING feed AS f ON p.sku = f.sku
WHEN MATCHED AND p.price <> f.price THEN
  UPDATE SET price = f.price
WHEN NOT MATCHED THEN
  INSERT (sku, name, category, price) VALUES (f.sku, f.name, 'books', f.price)
WHEN NOT MATCHED BY SOURCE AND p.category = 'books' THEN
  UPDATE SET discontinued = true
RETURNING merge_action() AS action, p.sku, old.price AS old_price, new.price AS new_price, p.discontinued;

-- @step T1 "shop's books after the full merge."
SELECT sku, name, price, discontinued FROM products WHERE category = 'books' ORDER BY sku;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "again."
BEGIN;

-- @step T1 "the same, without AND p.category = 'books'. every product missing from a list of books is not matched by source: the 188 that aren't books and the 4 that are. MERGE 196."
MERGE INTO products AS p
USING feed AS f ON p.sku = f.sku
WHEN MATCHED AND p.price <> f.price THEN
  UPDATE SET price = f.price
WHEN NOT MATCHED THEN
  INSERT (sku, name, category, price) VALUES (f.sku, f.name, 'books', f.price)
WHEN NOT MATCHED BY SOURCE THEN
  UPDATE SET discontinued = true
RETURNING merge_action() AS action, p.sku, old.price AS old_price, new.price AS new_price, p.discontinued;

-- @step T1 "undo."
ROLLBACK;
