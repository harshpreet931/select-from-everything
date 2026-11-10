-- @title a soft deadlock: the detector reorders a lock queue instead of cancelling anyone
-- @sessions T1 T2 T3
-- @server log_error_verbosity=terse
-- @session T1 log_lock_waits=on
-- @each locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 reads accounts in an open transaction: ACCESS SHARE."
BEGIN;
SELECT count(*) FROM accounts;

-- @step T2 blocks "T2's ALTER TABLE queues for ACCESS EXCLUSIVE behind T1. a hard edge: T1 holds a lock T2 can't share."
ALTER TABLE accounts ADD COLUMN note text;

-- @step T3 "T3 takes advisory lock 1."
BEGIN;
SELECT pg_advisory_xact_lock(1);

-- @step T3 blocks "T3 reads accounts and queues behind T2. a soft edge: T3's ACCESS SHARE only conflicts with what T2 is waiting for, not with anything granted."
SELECT count(*) FROM accounts;

-- @step T1 blocks "T1 wants advisory lock 1, which T3 holds. T1 → T3 → T2 → T1 is a cycle. after deadlock_timeout T1's check finds it, sees that one edge is soft, and moves T3 ahead of T2 in the queue. T3 gets its lock. nobody is cancelled."
SELECT pg_advisory_xact_lock(1);

-- @step obs +log "the server log says what happened."
SELECT 1 AS log;

-- @step T3 "T3 commits and releases advisory lock 1, so T1 gets it."
COMMIT;

-- @step T1 "T1 commits, and T2's ALTER finally runs."
COMMIT;
