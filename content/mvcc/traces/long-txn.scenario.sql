-- @title one open repeatable read transaction, eight deleted rows, and a VACUUM that can't remove them until it ends
-- @server log_min_messages=info
-- @sessions T1 T2
-- @each xids heap(t)

-- @setup
CREATE TABLE t (id int PRIMARY KEY, pad text NOT NULL);
INSERT INTO t SELECT g, repeat('x', 900) FROM generate_series(1, 16) AS g ORDER BY g;
VACUUM t;

-- @step T1 "T1 opens a repeatable read transaction and reads. that fixes its snapshot, and the snapshot's xmin is now the oldest thing anybody needs."
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) FROM t;

-- @step T2 "T2 deletes every even row and commits. for everyone who starts from now on, those eight rows are gone."
DELETE FROM t WHERE id % 2 = 0;

-- @step obs +log "VACUUM. T1's snapshot was taken before the delete committed, so T1 might still read those rows. VACUUM has to leave all eight: dead, but not yet removable."
VACUUM (VERBOSE) t;

-- @step obs "pg_stat_activity shows who is holding things back: T1 has no xid at all, only a snapshot xmin."
SELECT application_name AS session, backend_xid, backend_xmin, state
FROM pg_stat_activity
WHERE application_name IN ('T1', 'T2')
ORDER BY 1;

-- @step T1 "T1 commits. it never even read those rows again."
COMMIT;

-- @step obs +log "VACUUM again. now nothing open can see the deleted rows, and all eight go."
VACUUM (VERBOSE) t;
