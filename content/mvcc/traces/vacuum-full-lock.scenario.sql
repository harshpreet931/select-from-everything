-- @title a reader holds the table; VACUUM runs right past it, VACUUM FULL has to wait, and a second reader queues behind VACUUM FULL
-- @sessions T1 T2 T3
-- @each xids locks

-- @setup
CREATE TABLE t (id int PRIMARY KEY, pad text NOT NULL);
INSERT INTO t SELECT g, repeat('x', 200) FROM generate_series(1, 204) AS g ORDER BY g;
DELETE FROM t WHERE id % 3 <> 0;

-- @step T2 "T2 opens a transaction and reads t. it holds an ACCESS SHARE lock on the table until it ends."
BEGIN;
SELECT count(*) FROM t;

-- @step T1 "plain VACUUM takes SHARE UPDATE EXCLUSIVE, which doesn't conflict with readers or writers. it runs and finishes while T2 is still there."
VACUUM t;

-- @step obs "the file: still six pages, under its first file number."
SELECT pg_relation_filenode('t') AS filenode, pg_relation_size('t') AS bytes;

-- @step T1 blocks "VACUUM FULL needs ACCESS EXCLUSIVE, which conflicts with everything, T2's read included. it waits."
VACUUM FULL t;

-- @step T3 blocks "T3 only wants to read. ACCESS SHARE doesn't conflict with T2, but it conflicts with the ACCESS EXCLUSIVE request in front of it, so T3 queues too."
SELECT count(*) FROM t;

-- @step T2 "T2 commits. VACUUM FULL gets its lock, rewrites the table, and lets go. then T3 reads."
COMMIT;

-- @step obs "a new file number, and a third of the size."
SELECT pg_relation_filenode('t') AS filenode, pg_relation_size('t') AS bytes;
