-- @title two writers and a reader on one leaf page, and nobody waits
-- @sessions T1 T2 T3
-- @each locks

-- btree-concurrency reads this file. c_id is a one-leaf index. T1 and T2 insert neighbouring
-- keys into that same leaf, T3 reads it, all while T1 and T2 are uncommitted. pg_locks shows
-- relation locks only: page latches are LWLocks, held for microseconds, and never listed.

-- @setup
CREATE TABLE c (id int);
CREATE INDEX c_id ON c (id);
INSERT INTO c SELECT g * 10 FROM generate_series(1, 30) AS g;
VACUUM c;

-- @step T1 "T1 inserts 55 and stays open. its entry goes into the only leaf."
BEGIN;
INSERT INTO c VALUES (55);

-- @step T2 "T2 inserts 56 into the same leaf, right next to T1's entry. no wait."
BEGIN;
INSERT INTO c VALUES (56);

-- @step T3 "T3 scans the same leaf while both are uncommitted. no wait either: it skips their rows by visibility."
SET enable_seqscan = off;
SELECT count(*) FROM c WHERE id BETWEEN 50 AND 60;

-- @step T1 "T1 commits."
COMMIT;

-- @step T2 "T2 commits. at no point was there a lock on an index page in pg_locks."
COMMIT;
