-- @title two workers, FOR UPDATE NOWAIT: the second one gets an error
-- @sessions W1 W2
-- @each xids

-- @setup
CREATE TABLE jobs (
  id      int PRIMARY KEY,
  task    text NOT NULL,
  done_by text
);
INSERT INTO jobs SELECT g, 'email #' || g, NULL FROM generate_series(1, 4) AS g ORDER BY g;
VACUUM jobs;

-- @step W1 "W1 claims the oldest open job: 1."
BEGIN;
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 1 FOR UPDATE NOWAIT;

-- @step W2 errors=55P03 "W2 runs the same query with NOWAIT. job 1 is locked, so instead of waiting it fails at once: 55P03."
BEGIN;
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 1 FOR UPDATE NOWAIT;

-- @step W1 "W1 does job 1."
UPDATE jobs SET done_by = 'W1' WHERE id = 1;

-- @step W1 "W1 commits. W2 got nothing, and has to roll back before it can try again."
COMMIT;

-- @step W2 "W2 rolls back. its next attempt will find job 2."
ROLLBACK;
