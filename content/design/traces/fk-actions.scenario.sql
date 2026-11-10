-- @title delete an author under each ON DELETE action, and look at the posts left behind
-- @engine pglite
-- @each

-- foreign-keys reads these for its RunPick: each round rebuilds the tables, deletes author 1, reads posts.

-- @step T1 "round 1: NO ACTION."
CREATE TABLE authors (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE posts (id int PRIMARY KEY, author_id int DEFAULT 0 REFERENCES authors, title text NOT NULL);
INSERT INTO authors VALUES (0, 'deleted user'), (1, 'Ada'), (2, 'Grace');
INSERT INTO posts VALUES (10, 1, 'notes on the engine'), (11, 2, 'nanoseconds'), (12, 1, 'the first program');

-- @step T1 errors=23503 "the default. the delete would orphan two posts, so it fails: 23503."
DELETE FROM authors WHERE id = 1;

-- @step T1 "the posts after it."
SELECT id, author_id, title FROM posts ORDER BY id;

-- @step T1 "round 2: RESTRICT."
DROP TABLE posts, authors;
CREATE TABLE authors (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE posts (id int PRIMARY KEY, author_id int DEFAULT 0 REFERENCES authors ON DELETE RESTRICT, title text NOT NULL);
INSERT INTO authors VALUES (0, 'deleted user'), (1, 'Ada'), (2, 'Grace');
INSERT INTO posts VALUES (10, 1, 'notes on the engine'), (11, 2, 'nanoseconds'), (12, 1, 'the first program');

-- @step T1 errors=23001 "RESTRICT fails too, with its own SQLSTATE, 23001. the bigger difference only shows when the check is deferred."
DELETE FROM authors WHERE id = 1;

-- @step T1 "the posts after it."
SELECT id, author_id, title FROM posts ORDER BY id;

-- @step T1 "round 3: CASCADE."
DROP TABLE posts, authors;
CREATE TABLE authors (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE posts (id int PRIMARY KEY, author_id int DEFAULT 0 REFERENCES authors ON DELETE CASCADE, title text NOT NULL);
INSERT INTO authors VALUES (0, 'deleted user'), (1, 'Ada'), (2, 'Grace');
INSERT INTO posts VALUES (10, 1, 'notes on the engine'), (11, 2, 'nanoseconds'), (12, 1, 'the first program');

-- @step T1 "CASCADE deletes the posts with their author."
DELETE FROM authors WHERE id = 1;

-- @step T1 "the posts after it."
SELECT id, author_id, title FROM posts ORDER BY id;

-- @step T1 "round 4: SET NULL."
DROP TABLE posts, authors;
CREATE TABLE authors (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE posts (id int PRIMARY KEY, author_id int DEFAULT 0 REFERENCES authors ON DELETE SET NULL, title text NOT NULL);
INSERT INTO authors VALUES (0, 'deleted user'), (1, 'Ada'), (2, 'Grace');
INSERT INTO posts VALUES (10, 1, 'notes on the engine'), (11, 2, 'nanoseconds'), (12, 1, 'the first program');

-- @step T1 "SET NULL keeps the posts and blanks the reference."
DELETE FROM authors WHERE id = 1;

-- @step T1 "the posts after it."
SELECT id, author_id, title FROM posts ORDER BY id;

-- @step T1 "round 5: SET DEFAULT."
DROP TABLE posts, authors;
CREATE TABLE authors (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE posts (id int PRIMARY KEY, author_id int DEFAULT 0 REFERENCES authors ON DELETE SET DEFAULT, title text NOT NULL);
INSERT INTO authors VALUES (0, 'deleted user'), (1, 'Ada'), (2, 'Grace');
INSERT INTO posts VALUES (10, 1, 'notes on the engine'), (11, 2, 'nanoseconds'), (12, 1, 'the first program');

-- @step T1 "SET DEFAULT points the posts at the column default, author 0, which has to exist."
DELETE FROM authors WHERE id = 1;

-- @step T1 "the posts after it."
SELECT id, author_id, title FROM posts ORDER BY id;

-- @step T1 "round 6: posts belong to a tenant, and the foreign key is (tenant_id, author_id)."
DROP TABLE posts, authors;
CREATE TABLE authors (tenant_id int, id int, name text NOT NULL, PRIMARY KEY (tenant_id, id));
CREATE TABLE posts (id int PRIMARY KEY, tenant_id int NOT NULL, author_id int, title text NOT NULL,
  FOREIGN KEY (tenant_id, author_id) REFERENCES authors ON DELETE SET NULL (author_id));
INSERT INTO authors VALUES (7, 1, 'Ada'), (7, 2, 'Grace');
INSERT INTO posts VALUES (10, 7, 1, 'notes on the engine'), (11, 7, 2, 'nanoseconds'), (12, 7, 1, 'the first program');

-- @step T1 "SET NULL (author_id) blanks only that column. a plain SET NULL would blank tenant_id too, and tenant_id is NOT NULL."
DELETE FROM authors WHERE tenant_id = 7 AND id = 1;

-- @step T1 "the posts after it."
SELECT id, tenant_id, author_id, title FROM posts ORDER BY id;
