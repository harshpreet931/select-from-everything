-- @title read committed: a DELETE that waits for a row, re-checks it, and deletes nothing
-- @sessions T1 T2
-- @each xids heap(counters)

-- @setup
CREATE TABLE counters (
  id   int PRIMARY KEY,
  hits int NOT NULL
);
INSERT INTO counters VALUES (1, 9), (2, 10);
VACUUM counters;

-- @step T1 "T1 adds one to every counter: 9 becomes 10, 10 becomes 11. not committed yet."
BEGIN;
UPDATE counters SET hits = hits + 1;

-- @step T2 blocks "T2 deletes the counter at 10. its snapshot has 9 and 10, so only row 2 matches, and row 2 is locked. T2 waits."
DELETE FROM counters WHERE hits = 10;

-- @step T1 "T1 commits. T2 re-checks row 2: it's 11 now, so it no longer matches. row 1 is 10 now, but T2 already passed it when it was 9."
COMMIT;

-- @step T2 "DELETE 0. there was a counter at 10 before T1, and there's one at 10 after T1, and T2 deleted neither."
SELECT id, hits FROM counters ORDER BY id;
