-- @title two sessions insert the same key into a unique index
-- @sessions T1 T2
-- @each locks

-- unique-checks reads this file. round one: T1 inserts 5 and stays open, T2 inserts 5 too and
-- has to wait, because the index can't say yet whether 5 is taken. T1 commits: 23505.
-- round two, same race with 7, but T1 rolls back: T2's insert goes through.

-- @setup
CREATE TABLE k (id int PRIMARY KEY);
INSERT INTO k VALUES (1), (2), (3);
VACUUM k;

-- @step T1 "T1 inserts 5 and doesn't commit yet. its index entry for 5 is in the leaf already."
BEGIN;
INSERT INTO k VALUES (5);

-- @step T2 blocks errors=23505 "T2 inserts 5. the unique check finds T1's entry, whose row is neither committed nor aborted, so T2 waits on T1's transaction id."
INSERT INTO k VALUES (5);

-- @step T1 "T1 commits. T2 wakes up, checks again, finds a committed 5, and fails with 23505."
COMMIT;

-- @step T1 "round two: T1 inserts 7 and stays open."
BEGIN;
INSERT INTO k VALUES (7);

-- @step T2 blocks "T2 inserts 7, and waits on T1 again."
INSERT INTO k VALUES (7);

-- @step T1 +btree(k_pkey) "T1 rolls back. T2 wakes, checks again: the only other 7 belongs to an aborted transaction, so it doesn't count. T2's insert succeeds."
ROLLBACK;
