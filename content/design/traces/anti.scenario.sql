-- @title four schema anti-patterns, the query that hurts, and the same query after the fix
-- @engine pglite
-- @each

-- anti-patterns reads these for its RunPick (pain / fix per pattern) and its catalog bars.

-- @step T1 "EAV: every attribute is a row, every value is text."
CREATE TABLE product_attrs (product_id int, attr text, value text, PRIMARY KEY (product_id, attr));
INSERT INTO product_attrs VALUES
  (1, 'name', 'assam tea'), (1, 'price', '6.50'), (1, 'color', 'red'),
  (2, 'name', 'blue mug'),  (2, 'price', '12.00'), (2, 'color', 'blue'),
  (3, 'name', 'teapot'),    (3, 'price', '45.00'), (3, 'color', 'red'),
  (4, 'name', 'tea towel'), (4, 'price', '9.00'), (4, 'colour', 'red');

-- @step T1 "red products under 9.50: a self-join per attribute, and a text comparison. as strings '45.00' < '9.50', so the teapot sneaks in, and the tea towel is lost to a misspelled attribute name."
SELECT n.value AS name, p.value AS price
FROM product_attrs AS n
JOIN product_attrs AS p ON p.product_id = n.product_id AND p.attr = 'price'
JOIN product_attrs AS c ON c.product_id = n.product_id AND c.attr = 'color'
WHERE n.attr = 'name' AND c.value = 'red' AND p.value < '9.50'
ORDER BY n.product_id;

-- @step T1 "the fix: real columns with real types."
CREATE TABLE products (id int PRIMARY KEY, name text NOT NULL, price numeric(8,2) NOT NULL CHECK (price >= 0), color text);
INSERT INTO products VALUES (1, 'assam tea', 6.50, 'red'), (2, 'blue mug', 12.00, 'blue'), (3, 'teapot', 45.00, 'red'), (4, 'tea towel', 9.00, 'red');

-- @step T1 "one table, numeric comparison, no joins."
SELECT name, price FROM products WHERE color = 'red' AND price < 9.50 ORDER BY id;

-- @step T1 "polymorphic association: a comment points at a post or a photo, named by a type column and an id."
CREATE TABLE posts (id int PRIMARY KEY, title text NOT NULL);
CREATE TABLE photos (id int PRIMARY KEY, caption text NOT NULL);
CREATE TABLE comments (id int PRIMARY KEY, target_type text NOT NULL, target_id int NOT NULL, body text NOT NULL);
INSERT INTO posts VALUES (1, 'why pages are 8 KB');
INSERT INTO photos VALUES (1, 'the left-handed teapot');

-- @step T1 "no foreign key is possible on (target_type, target_id), so a comment on post 99, which doesn't exist, goes straight in."
INSERT INTO comments VALUES (1, 'post', 1, 'nice'), (2, 'photo', 1, 'lovely'), (3, 'post', 99, 'orphan from day one');
SELECT c.id, c.target_type, c.target_id, coalesce(p.title, ph.caption) AS target
FROM comments AS c
LEFT JOIN posts AS p ON c.target_type = 'post' AND p.id = c.target_id
LEFT JOIN photos AS ph ON c.target_type = 'photo' AND ph.id = c.target_id
ORDER BY c.id;

-- @step T1 "the fix: one nullable foreign key per target, and a CHECK that exactly one is set."
CREATE TABLE comments2 (
  id       int PRIMARY KEY,
  post_id  int REFERENCES posts,
  photo_id int REFERENCES photos,
  body     text NOT NULL,
  CHECK (num_nonnulls(post_id, photo_id) = 1)
);
INSERT INTO comments2 VALUES (1, 1, NULL, 'nice'), (2, NULL, 1, 'lovely');

-- @step T1 errors=23503 "the same orphan, refused."
INSERT INTO comments2 VALUES (3, 99, NULL, 'orphan from day one');

-- @step T1 "comma list: tags in a text column."
CREATE TABLE articles (id int PRIMARY KEY, title text NOT NULL, tags text NOT NULL);
INSERT INTO articles VALUES (1, 'roses', 'red,garden'), (2, 'thermal cameras', 'infrared,tech'), (3, 'apples', 'fruit,red');

-- @step T1 "articles tagged red, with LIKE. infrared matches too."
SELECT id, title, tags FROM articles WHERE tags LIKE '%red%' ORDER BY id;

-- @step T1 "the fix: a junction table, one row per tag."
CREATE TABLE article_tags (article_id int REFERENCES articles, tag text, PRIMARY KEY (article_id, tag));
INSERT INTO article_tags SELECT id, t FROM articles, string_to_table(tags, ',') AS t ORDER BY 1, 2;

-- @step T1 "an exact match, indexable, and a tag count is a GROUP BY."
SELECT a.id, a.title FROM articles AS a JOIN article_tags AS t ON t.article_id = a.id WHERE t.tag = 'red' ORDER BY a.id;

-- @step T1 "missing foreign keys: orders.customer_id is just an int."
CREATE TABLE customers (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE orders (id int PRIMARY KEY, customer_id int NOT NULL, total numeric(8,2) NOT NULL);
INSERT INTO customers VALUES (1, 'Ada'), (2, 'Grace');
INSERT INTO orders VALUES (10, 1, 22.00), (11, 2, 6.50), (12, 3, 15.00);
DELETE FROM customers WHERE id = 2;

-- @step T1 "an inner join quietly drops the orders whose customer doesn't exist. revenue by customer is short by two orders."
SELECT c.name, sum(o.total) AS revenue FROM orders AS o JOIN customers AS c ON c.id = o.customer_id GROUP BY c.name ORDER BY c.name;

-- @step T1 "the fix starts by finding the orphans."
SELECT o.id, o.customer_id FROM orders AS o WHERE NOT EXISTS (SELECT 1 FROM customers AS c WHERE c.id = o.customer_id) ORDER BY o.id;

-- @step T1 errors=23503 "then the foreign key. adding it checks every existing row and refuses while orphans exist. NOT VALID would protect new rows now and leave the old ones for later."
ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers;

-- @step T1 "table per tenant: 100 tenants, each with its own orders table."
DO $$ BEGIN
  FOR t IN 1..100 LOOP
    EXECUTE format('CREATE TABLE tenant_%s_orders (id int PRIMARY KEY, total numeric(8,2) NOT NULL, note text)', t);
  END LOOP;
END $$;
CREATE TABLE shared_orders (tenant_id int, id int, total numeric(8,2) NOT NULL, note text, PRIMARY KEY (tenant_id, id));

-- @step T1 "catalog rows each design costs: the table, its primary key index, its toast table and toast index."
SELECT 'table per tenant' AS design, count(*) AS relations FROM pg_class WHERE relname LIKE 'tenant\_%' OR oid IN (SELECT reltoastrelid FROM pg_class WHERE relname LIKE 'tenant\_%') OR oid IN (SELECT indexrelid FROM pg_index WHERE indrelid IN (SELECT reltoastrelid FROM pg_class WHERE relname LIKE 'tenant\_%'))
UNION ALL
SELECT 'one shared table', count(*) FROM pg_class WHERE relname LIKE 'shared\_orders%' OR oid IN (SELECT reltoastrelid FROM pg_class WHERE relname = 'shared_orders') OR oid IN (SELECT indexrelid FROM pg_index WHERE indrelid IN (SELECT reltoastrelid FROM pg_class WHERE relname = 'shared_orders'))
ORDER BY relations DESC;
