-- @title a tiny index next to its table, then a real one on customers(name)
-- @engine pglite
-- @db shop
-- @each

-- what-an-index-is reads this file. few is the first twelve customers (the hand-made edge cases),
-- with an index on name: its entries in key order, and the table in ctid order, side by side.
-- then the same index on all 2,000 customers, and one lookup with and without it.

-- @setup
CREATE TABLE few AS SELECT id, name, city FROM customers WHERE id <= 12 ORDER BY id;
CREATE INDEX few_name ON few (name);

-- @probe +btree(few_name) "the index: one entry per row, sorted by name, each with the address (page, slot) of its row."

-- @step T1 "the table, in the order it's stored: by ctid."
SELECT ctid, id, name, city FROM few ORDER BY ctid;

-- @explain T1 "ada, without an index on name: read all of customers and check every row."
SELECT * FROM customers WHERE name = 'Ada Lovelace';

-- @step T1 +btree(customers_name, items=4) "the same index on all 2,000 customers: a root page over a row of leaf pages."
CREATE INDEX customers_name ON customers (name);

-- @explain T1 "ada, with the index: down the tree to one leaf, then one heap page."
SELECT * FROM customers WHERE name = 'Ada Lovelace';

-- @step T1 "the table and its index are separate files, each made of 8 KB pages."
SELECT relname, relkind, pg_relation_size(oid) / 8192 AS pages
FROM pg_class WHERE relname IN ('customers', 'customers_name')
ORDER BY relname;
