-- @title a transaction-level advisory lock is released when the transaction ends
-- @sessions T1 T2
-- @each locks

-- @step T1 "T1 opens a transaction."
BEGIN;

-- @step T1 "T1 takes transaction-level advisory lock 7."
SELECT pg_advisory_xact_lock(7);

-- @step T2 "T2 tries for lock 7: false, T1's transaction has it."
SELECT pg_try_advisory_lock(7);

-- @step T1 "T1 rolls back. a transaction-level lock goes with the transaction, commit or rollback."
ROLLBACK;

-- @step T2 "T2 tries again: true."
SELECT pg_try_advisory_lock(7);
