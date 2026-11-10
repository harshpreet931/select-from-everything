-- @title two workers, plain FOR UPDATE: the second one waits
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
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 1 FOR UPDATE;

-- @step W2 blocks "W2 runs the same query. job 1 is locked by W1, and plain FOR UPDATE waits for it."
BEGIN;
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 1 FOR UPDATE;

-- @step W1 "W1 does job 1."
UPDATE jobs SET done_by = 'W1' WHERE id = 1;

-- @step W1 "W1 commits. W2 wakes up, re-checks job 1 (done now, so it no longer matches), and moves on to job 2. it waited for a job it was never going to get."
COMMIT;
