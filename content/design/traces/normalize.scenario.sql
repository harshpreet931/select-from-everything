-- @title one wide orders table with the address in every row, and the same data split so the address lives once
-- @engine pglite
-- @each

-- normal-forms reads these for NormalizeLab: the wide table, then customers and order lines after the split.

-- @step T1 "the wide table: one row per order line, the customer's name and address copied into every one."
CREATE TABLE orders_wide (
  order_id   int  NOT NULL,
  sku        text NOT NULL,
  qty        int  NOT NULL,
  product    text NOT NULL,
  list_price numeric(8,2) NOT NULL,
  ordered_on date NOT NULL,
  email      text NOT NULL,
  customer   text NOT NULL,
  address    text NOT NULL,
  PRIMARY KEY (order_id, sku)
);
INSERT INTO orders_wide VALUES
  (101, 'TEA-01', 2, 'assam tea', 6.50, '2026-03-02', 'ada@example.com',   'Ada Lovelace', '12 Byron St, London'),
  (101, 'MUG-02', 1, 'blue mug',  9.00, '2026-03-02', 'ada@example.com',   'Ada Lovelace', '12 Byron St, London'),
  (102, 'TEA-01', 1, 'assam tea', 6.50, '2026-03-03', 'ada@example.com',   'Ada Lovelace', '12 Byron St, London'),
  (103, 'TEA-02', 3, 'green tea', 5.00, '2026-03-04', 'grace@example.com', 'Grace Okafor', '4 Elm Rd, Leeds'),
  (104, 'MUG-02', 2, 'blue mug',  9.00, '2026-03-05', 'ada@example.com',   'Ada Lovelace', '12 Byron St, London');

-- @step T1 "the columns the lab shows."
SELECT order_id, sku, product, customer, address FROM orders_wide ORDER BY order_id, sku;

-- @step T1 "the split: customers get a row each, order lines point at them by id."
CREATE TABLE customers (id int PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, address text NOT NULL);
INSERT INTO customers (id, email, name, address)
SELECT row_number() OVER (ORDER BY min(order_id)), email, customer, min(address)
FROM orders_wide GROUP BY email, customer ORDER BY 1;
CREATE TABLE order_lines AS
SELECT w.order_id, w.sku, c.id AS customer_id FROM orders_wide AS w JOIN customers AS c USING (email);

-- @step T1 "customers, one row each."
SELECT id, name, address FROM customers ORDER BY id;

-- @step T1 "the order lines, each pointing at a customer."
SELECT order_id, sku, customer_id FROM order_lines ORDER BY order_id, sku;
