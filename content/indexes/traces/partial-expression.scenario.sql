-- @title a partial index for the open orders, and an expression index for case-insensitive email
-- @engine pglite
-- @db shop
-- @each

-- partial-and-expression reads this file.

-- @step T1 "the same column indexed twice: every order, and only the open ones (placed or paid)."
CREATE INDEX orders_at_all ON orders (ordered_at);
CREATE INDEX orders_at_open ON orders (ordered_at) WHERE status IN ('placed', 'paid');

-- @step T1 "their sizes, in bytes, and how many rows each covers."
SELECT c.relname, pg_relation_size(c.oid) AS bytes, c.reltuples::int AS entries
FROM pg_class AS c WHERE c.relname IN ('orders_at_all', 'orders_at_open')
ORDER BY c.relname;

-- @step T1 "keep only the partial index."
DROP INDEX orders_at_all;

-- @explain T1 "the oldest open orders: the query's WHERE matches the index's, so the index is a list of exactly these rows, in order."
SELECT id, customer_id, ordered_at FROM orders WHERE status IN ('placed', 'paid') ORDER BY ordered_at LIMIT 10;
-- @explain T1 "status = 'placed' implies status IN ('placed', 'paid'), so the partial index still applies, with status checked on each row."
SELECT id, customer_id, ordered_at FROM orders WHERE status = 'placed' ORDER BY ordered_at LIMIT 10;
-- @explain T1 "status = 'shipped' isn't covered by the index's WHERE: none of these rows are in it, so it can't be used."
SELECT id, customer_id, ordered_at FROM orders WHERE status = 'shipped' ORDER BY ordered_at LIMIT 10;

-- @step T1 "an index on lower(email): it stores the result of the expression, not the column."
CREATE INDEX customers_lower_email ON customers (lower(email));
ANALYZE customers;

-- @explain T1 "the same expression in the query: an index scan. it finds both Zoes, whose emails differ only in case."
SELECT id, name, email FROM customers WHERE lower(email) = 'zoe.martin@example.com';
-- @explain T1 "the bare column: this index can't help (the unique index on email can, but only for exact case)."
SELECT id, name, email FROM customers WHERE email = 'zoe.martin@example.com';
-- @explain T1 "ILIKE is another way to ignore case, and no b-tree index serves it."
SELECT id, name, email FROM customers WHERE email ILIKE 'zoe.martin@example.com';
