-- @title the same forgotten transaction, but with idle_in_transaction_session_timeout set: the server ends it, and VACUUM can clean up
-- @server log_min_messages=info
-- @sessions T1 T2
-- @session T1 idle_in_transaction_session_timeout=500ms
-- @each

-- @setup
CREATE TABLE t (id int PRIMARY KEY, pad text NOT NULL);
INSERT INTO t SELECT g, repeat('x', 900) FROM generate_series(1, 16) AS g ORDER BY g;
VACUUM t;

-- @step T1 "T1 opens a repeatable read transaction, reads, and then the client goes quiet. its session has a 500 ms limit on sitting idle inside a transaction."
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) FROM t;

-- @step T2 "T2 deletes every even row and commits."
DELETE FROM t WHERE id % 2 = 0;

-- @step obs +log "a second goes by. T1 has been idle in a transaction for longer than its limit, so the server ends its session."
SELECT pg_sleep(1);

-- @step obs "T1 is gone from pg_stat_activity, and its snapshot with it."
SELECT application_name AS session, backend_xmin, state
FROM pg_stat_activity
WHERE application_name IN ('T1', 'T2')
ORDER BY 1;

-- @step obs +log "VACUUM. with T1's snapshot gone, the eight deleted rows are removable."
VACUUM (VERBOSE) t;
