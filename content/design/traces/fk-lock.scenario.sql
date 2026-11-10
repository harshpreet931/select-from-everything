-- @title inserting a child row key-share locks the parent: updates of the parent go through, a delete waits
-- @ext pgrowlocks
-- @sessions T1 T2
-- @each locks

-- @setup
CREATE TABLE customers (id int PRIMARY KEY, name text NOT NULL, city text);
CREATE TABLE orders (id int PRIMARY KEY, customer_id int NOT NULL REFERENCES customers, total numeric(8,2) NOT NULL);
INSERT INTO customers VALUES (42, 'Ada Lovelace', 'london'), (7, 'Ming Li', 'manchester');
VACUUM customers;

-- @step T1 "T1 places an order for customer 42 and doesn't commit yet. the foreign key check locks Ada's row FOR KEY SHARE, so nobody can delete her, or change her id, before T1 is done."
BEGIN;
INSERT INTO orders VALUES (1, 42, 22.00);

-- @step obs "pgrowlocks reads the lock off Ada's row: one locker, mode For Key Share."
SELECT locked_row, modes FROM pgrowlocks('customers');

-- @step T2 "T2 changes Ada's city. an UPDATE that doesn't touch a key column takes FOR NO KEY UPDATE, which doesn't conflict with KEY SHARE. no wait."
UPDATE customers SET city = 'bristol' WHERE id = 42;

-- @step T2 blocks errors=23503 "T2 tries to delete Ada. a DELETE needs FOR UPDATE on the row, the one mode KEY SHARE blocks. T2 waits for T1."
DELETE FROM customers WHERE id = 42;

-- @step T1 "T1 commits: order 1 now really points at Ada. T2 wakes, re-checks, finds a referencing row, and fails with 23503."
COMMIT;
