-- @title two sessions bump the same counter row: the second waits for the first to commit
-- @sessions T1 T2
-- @each locks

-- @setup
CREATE TABLE posts (id int PRIMARY KEY, title text NOT NULL, comment_count int NOT NULL DEFAULT 0);
INSERT INTO posts (id, title) VALUES (1, 'why pages are 8 KB');
VACUUM posts;

-- @step T1 "T1 adds a comment and bumps post 1's counter. its transaction is still open, so it holds the row lock."
BEGIN;
UPDATE posts SET comment_count = comment_count + 1 WHERE id = 1;

-- @step T2 blocks "T2 adds a comment to the same post. its UPDATE needs the same row, and waits for T1's transaction."
BEGIN;
UPDATE posts SET comment_count = comment_count + 1 WHERE id = 1;

-- @step T1 "T1 commits. T2 wakes, re-reads the row T1 wrote, and adds its own 1 on top: no lost update, but no parallelism either."
COMMIT;

-- @step T2 "T2 commits."
COMMIT;

-- @step obs "both increments landed."
SELECT id, comment_count FROM posts;
