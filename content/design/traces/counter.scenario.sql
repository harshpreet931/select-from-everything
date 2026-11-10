-- @title a cached comment count, first kept by hand and drifting, then kept by a trigger
-- @engine pglite
-- @each

-- denormalization reads these for its TableSteps. the state query shows the stored count next to the real one.

-- @step T1 "posts carry a comment_count, so the front page doesn't count comments on every view."
CREATE TABLE posts (id int PRIMARY KEY, title text NOT NULL, comment_count int NOT NULL DEFAULT 0);
CREATE TABLE comments (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, post_id int NOT NULL REFERENCES posts, body text NOT NULL);
INSERT INTO posts (id, title) VALUES (1, 'why pages are 8 KB'), (2, 'the left-handed teapot');

-- @step T1 "the stored count and the real count, side by side."
SELECT p.id, p.title, p.comment_count, (SELECT count(*) FROM comments AS c WHERE c.post_id = p.id) AS real_count FROM posts AS p ORDER BY p.id;

-- @step T1 "the app adds a comment and bumps the counter, in one transaction. fine."
BEGIN;
INSERT INTO comments (post_id, body) VALUES (1, 'great post');
UPDATE posts SET comment_count = comment_count + 1 WHERE id = 1;
COMMIT;

-- @step T1 "after it."
SELECT p.id, p.title, p.comment_count, (SELECT count(*) FROM comments AS c WHERE c.post_id = p.id) AS real_count FROM posts AS p ORDER BY p.id;

-- @step T1 "a moderation script deletes a comment, and nobody told it about the counter."
DELETE FROM comments WHERE post_id = 1;
INSERT INTO comments (post_id, body) VALUES (2, 'i am left-handed'), (2, 'me too');

-- @step T1 "post 1 says one comment and has none; post 2 says none and has two. the copy drifted."
SELECT p.id, p.title, p.comment_count, (SELECT count(*) FROM comments AS c WHERE c.post_id = p.id) AS real_count FROM posts AS p ORDER BY p.id;

-- @step T1 "a trigger keeps the counter: every insert or delete on comments adjusts it, in the same transaction. then a one-time fix of the drift."
CREATE FUNCTION bump_comment_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSE
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER comments_count AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION bump_comment_count();
UPDATE posts AS p SET comment_count = (SELECT count(*) FROM comments AS c WHERE c.post_id = p.id);

-- @step T1 "fixed."
SELECT p.id, p.title, p.comment_count, (SELECT count(*) FROM comments AS c WHERE c.post_id = p.id) AS real_count FROM posts AS p ORDER BY p.id;

-- @step T1 "the same careless script again: two inserts, one delete, no counter code anywhere."
INSERT INTO comments (post_id, body) VALUES (1, 'first!'), (1, 'second');
DELETE FROM comments WHERE body = 'me too';

-- @step T1 "the trigger fired once per row. the counts agree."
SELECT p.id, p.title, p.comment_count, (SELECT count(*) FROM comments AS c WHERE c.post_id = p.id) AS real_count FROM posts AS p ORDER BY p.id;
