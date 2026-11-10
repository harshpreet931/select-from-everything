-- @title three plans over a 24-row products table, for the executor's pull loop
-- @engine pglite
-- @each

-- @setup
-- the same two tables src/lib/db/fixtures/gen.mjs builds for the volcano model's test
-- (src/lib/db/sim/volcano.test.ts checks these three plans: per-node rows = actual rows).
CREATE TABLE products (id int PRIMARY KEY, name text NOT NULL, category text, price numeric(8,2) NOT NULL, discontinued boolean NOT NULL DEFAULT false);
INSERT INTO products
SELECT i,
       (ARRAY['lamp','mug','kettle','novel','atlas','puzzle','kite','spade','teapot','chess','yoyo','rake'])[1 + (i * 7) % 12] || '-' || i,
       CASE WHEN i % 11 = 0 THEN NULL ELSE (ARRAY['books','games','kitchen','garden','toys'])[1 + (i * 3) % 5] END,
       round((5 + (i * 37) % 90 + ((i * 13) % 100) / 100.0)::numeric, 2),
       i % 9 = 0
FROM generate_series(1, 24) i;
CREATE TABLE orders (id int PRIMARY KEY, product_id int NOT NULL, qty int NOT NULL);
INSERT INTO orders SELECT i, 1 + (i * 5) % 24, 1 + i % 3 FROM generate_series(1, 16) i;
ANALYZE products;
ANALYZE orders;

-- @step T1 "the 24 products, in the order they sit in the table."
SELECT id, name, category, price, discontinued FROM products ORDER BY ctid;

-- @step T1 "the 16 orders."
SELECT id, product_id, qty FROM orders ORDER BY ctid;

-- @explain T1 "LIMIT 3 over a filtered scan. the scan stops after its third match."
SELECT id, name, price FROM products WHERE price > 50 LIMIT 3;

-- @explain T1 "the same, sorted first. the Sort has to see every row before it can hand over the most expensive one."
SELECT id, name, price FROM products WHERE price > 50 ORDER BY price DESC LIMIT 3;

-- @explain T1 "a hash join. the Hash below it reads all its rows before the join returns anything."
SELECT o.id, p.name, o.qty FROM orders o JOIN products p ON p.id = o.product_id WHERE p.price > 30;
