-- @title a job queue drained by three workers with FOR UPDATE SKIP LOCKED
-- @sessions W1 W2 W3
-- @each heap(jobs)

-- @setup
CREATE TABLE jobs (
  id      int PRIMARY KEY,
  task    text NOT NULL,
  done_by text
);
INSERT INTO jobs SELECT g, 'email #' || g, NULL FROM generate_series(1, 7) AS g ORDER BY g;
VACUUM jobs;

-- @step W1 +xids "W1 opens a transaction and claims the two oldest jobs that nobody holds: 1 and 2. they're row-locked by W1 now."
BEGIN;
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED;

-- @step W2 +xids "W2 runs the exact same query. 1 and 2 are locked, so it skips them and gets 3 and 4. no waiting."
BEGIN;
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED;

-- @step W3 +xids "W3, same query again: 5 and 6."
BEGIN;
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED;

-- @step W1 "W1 sends its two emails and marks them done."
UPDATE jobs SET done_by = 'W1' WHERE id IN (1, 2);

-- @step W1 "W1 commits. jobs 1 and 2 are done, and their locks are gone."
COMMIT;

-- @step W1 +xids "W1 comes back for more. 1 and 2 are done, 3 to 6 are locked, so it gets the only one left: 7."
BEGIN;
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED;

-- @step W3 "W3 finishes 5 and 6, and commits."
UPDATE jobs SET done_by = 'W3' WHERE id IN (5, 6);
COMMIT;

-- @step W2 "W2 finishes 3 and 4, and commits."
UPDATE jobs SET done_by = 'W2' WHERE id IN (3, 4);
COMMIT;

-- @step W1 "W1 finishes 7, and commits."
UPDATE jobs SET done_by = 'W1' WHERE id = 7;
COMMIT;

-- @step W2 -heap "W2 asks again: nothing left. an empty result, and no waiting."
SELECT id FROM jobs WHERE done_by IS NULL ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED;

-- @step W3 -heap "seven jobs, three workers, every job done exactly once."
SELECT id, done_by FROM jobs ORDER BY id;
