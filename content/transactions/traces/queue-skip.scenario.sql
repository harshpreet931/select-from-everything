-- @title two workers, FOR UPDATE SKIP LOCKED: the second one takes the next job
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
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED;

-- @step W2 "W2 runs the same query with SKIP LOCKED. job 1 is locked, so it's skipped: W2 gets job 2, right away."
BEGIN;
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED;

-- @step W1 "W1 does job 1."
UPDATE jobs SET done_by = 'W1' WHERE id = 1;

-- @step W1 "W1 commits. W2 was never waiting."
COMMIT;
