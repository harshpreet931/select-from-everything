-- @title three sessions, one row, and what pg_locks says about it
-- @sessions T1 T2 T3
-- @server log_lock_waits=on log_error_verbosity=terse
-- @each locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 +xids "T1 updates alice and doesn't commit."
BEGIN;
UPDATE accounts SET balance = balance - 10 WHERE id = 1;

-- @step T2 "T2 opens a transaction and takes an advisory lock on 42, for no reason but to have one in the list."
BEGIN;
SELECT pg_advisory_xact_lock(42);

-- @step T2 blocks "T2 wants alice too, and waits for T1."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;

-- @step T3 blocks "T3 also wants alice, and queues behind T2."
UPDATE accounts SET balance = balance + 5 WHERE id = 1;

-- @step obs "every lock the three sessions hold or want, straight from pg_locks."
SELECT a.application_name AS session, l.locktype,
       coalesce(l.relation::regclass::text, l.transactionid::text, l.virtualxid, l.objid::text) AS object,
       l.page, l.tuple, l.mode, l.granted
FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
WHERE a.application_name IN ('T1', 'T2', 'T3')
ORDER BY session, l.granted DESC, l.locktype, object, l.mode;

-- @step obs "who blocks whom: pg_blocking_pids, with the statements."
SELECT w.application_name AS waiting, w.wait_event_type, w.wait_event,
       b.application_name AS blocked_by, b.state AS blocker_state,
       left(w.query, 40) AS waiting_query
FROM pg_stat_activity w
JOIN LATERAL unnest(pg_blocking_pids(w.pid)) AS bp(pid) ON true
JOIN pg_stat_activity b ON b.pid = bp.pid
ORDER BY waiting, blocked_by;

-- @step obs +log "with log_lock_waits = on, a wait longer than deadlock_timeout (100 ms here) leaves a line in the server log."
SELECT 1 AS log;

-- @step T1 -locks "T1 commits. T2 gets alice, and T3 now waits for T2."
COMMIT;

-- @step T2 -locks "T2 commits, and T3 goes."
COMMIT;
