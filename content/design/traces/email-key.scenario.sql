-- @title Ada changes her email: a natural key without cascade, with cascade, and a surrogate key
-- @engine pglite
-- @each

-- keys reads these for its RunPick: each round builds the tables, changes the email, reads orders.

-- @step T1 "round 1: customers keyed by email, orders point at the email."
CREATE TABLE customers (email text PRIMARY KEY, name text NOT NULL);
CREATE TABLE orders (id int PRIMARY KEY, customer_email text NOT NULL REFERENCES customers, total numeric(8,2) NOT NULL);
INSERT INTO customers VALUES ('ada@example.com', 'Ada Lovelace'), ('grace@example.com', 'Grace Okafor');
INSERT INTO orders VALUES (101, 'ada@example.com', 22.00), (102, 'ada@example.com', 6.50), (103, 'grace@example.com', 15.00), (104, 'ada@example.com', 18.00);

-- @step T1 errors=23503 "the key is referenced, and the foreign key says NO ACTION: three orders still point at the old email, so the update fails."
UPDATE customers SET email = 'ada@lovelace.dev' WHERE email = 'ada@example.com';

-- @step T1 "nothing changed."
SELECT id, customer_email, total FROM orders ORDER BY id;

-- @step T1 "round 2: the same, with ON UPDATE CASCADE on the foreign key."
DROP TABLE orders, customers;
CREATE TABLE customers (email text PRIMARY KEY, name text NOT NULL);
CREATE TABLE orders (id int PRIMARY KEY, customer_email text NOT NULL REFERENCES customers ON UPDATE CASCADE, total numeric(8,2) NOT NULL);
INSERT INTO customers VALUES ('ada@example.com', 'Ada Lovelace'), ('grace@example.com', 'Grace Okafor');
INSERT INTO orders VALUES (101, 'ada@example.com', 22.00), (102, 'ada@example.com', 6.50), (103, 'grace@example.com', 15.00), (104, 'ada@example.com', 18.00);

-- @step T1 "one UPDATE on customers. the cascade rewrites every order that pointed at the old email."
UPDATE customers SET email = 'ada@lovelace.dev' WHERE email = 'ada@example.com';

-- @step T1 "three orders rewritten: three new row versions, three index entries, WAL for each."
SELECT id, customer_email, total FROM orders ORDER BY id;

-- @step T1 "round 3: a surrogate id is the key, the email is just a unique column."
DROP TABLE orders, customers;
CREATE TABLE customers (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL);
CREATE TABLE orders (id int PRIMARY KEY, customer_id int NOT NULL REFERENCES customers, total numeric(8,2) NOT NULL);
INSERT INTO customers (email, name) VALUES ('ada@example.com', 'Ada Lovelace'), ('grace@example.com', 'Grace Okafor');
INSERT INTO orders VALUES (101, 1, 22.00), (102, 1, 6.50), (103, 2, 15.00), (104, 1, 18.00);

-- @step T1 "the email changes in one row."
UPDATE customers SET email = 'ada@lovelace.dev' WHERE email = 'ada@example.com';

-- @step T1 "orders didn't notice: they point at id 1, which never changes."
SELECT id, customer_id, total FROM orders ORDER BY id;
