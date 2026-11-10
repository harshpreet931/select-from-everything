-- @title one operator per index type, on small tables, with seq scans switched off
-- @engine pglite
-- @db shop
-- @each

-- index-types reads this file. the tables are small enough that postgres would rather read them,
-- so seq scans are off: the point is which kind of index can serve which operator at all. then the
-- same column of orders (ordered_at, stored in time order) indexed three ways, to compare sizes.

-- @setup
CREATE INDEX customers_email_hash ON customers USING hash (email);
CREATE INDEX products_tags_gin ON products USING gin (tags);
CREATE INDEX products_attrs_gin ON products USING gin (attrs);
CREATE TABLE bookings (room int NOT NULL, during tstzrange NOT NULL);
INSERT INTO bookings SELECT g % 20, tstzrange('2026-06-01'::timestamptz + (g * interval '3 hours'), '2026-06-01'::timestamptz + (g * interval '3 hours') + interval '2 hours') FROM generate_series(1, 2000) AS g ORDER BY g;
CREATE INDEX bookings_during ON bookings USING gist (during);
CREATE INDEX products_name_spgist ON products USING spgist (name);
ANALYZE bookings;

-- @step T1 "seq scans off, so every plan shows the index that can serve the operator."
SET enable_seqscan = off;

-- @explain T1 noanalyze "hash: equality and nothing else."
SELECT id FROM customers WHERE email = 'ada@example.com';
-- @explain T1 noanalyze "the hash index can't do a range: postgres falls back to the unique b-tree on email."
SELECT id FROM customers WHERE email > 'zz';
-- @explain T1 noanalyze "GIN on an array: which rows contain these elements."
SELECT id FROM products WHERE tags @> ARRAY['steel'];
-- @explain T1 noanalyze "GIN on jsonb: containment."
SELECT id FROM products WHERE attrs @> '{"color": "red"}';
-- @explain T1 noanalyze "GiST on a range: which bookings overlap this one."
SELECT room FROM bookings WHERE during && tstzrange('2026-06-10 10:00+00', '2026-06-10 12:00+00');
-- @explain T1 noanalyze "SP-GiST on text: starts-with."
SELECT id FROM products WHERE name ^@ 'steel';

-- @step T1 "back to normal, and orders.ordered_at (stored in time order) indexed three ways. the BRIN index summarizes every 4 pages (the default, 128, is more than the whole table)."
RESET enable_seqscan;
CREATE INDEX orders_at_btree ON orders (ordered_at);
CREATE INDEX orders_at_brin ON orders USING brin (ordered_at) WITH (pages_per_range = 4);
CREATE INDEX orders_at_hash ON orders USING hash (ordered_at);
SELECT c.relname, pg_relation_size(c.oid) AS bytes FROM pg_class AS c
WHERE c.relname IN ('orders', 'orders_at_btree', 'orders_at_brin', 'orders_at_hash')
ORDER BY bytes DESC;

-- @step T1 "drop the other two, so the month query has only the BRIN index to use."
DROP INDEX orders_at_btree;
DROP INDEX orders_at_hash;

-- @explain T1 "a month of orders through the BRIN index: it can only say which block ranges might match, so every row in them is rechecked."
SELECT count(*) FROM orders WHERE ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01';
