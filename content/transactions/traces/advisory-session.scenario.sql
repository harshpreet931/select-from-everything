-- @title a session-level advisory lock taken inside a transaction outlives the transaction
-- @sessions T1 T2
-- @each locks

-- @step T1 "T1 opens a transaction."
BEGIN;

-- @step T1 "T1 takes session-level advisory lock 7."
SELECT pg_advisory_lock(7);

-- @step T1 "T1 rolls the transaction back. you'd think the lock goes with it."
ROLLBACK;

-- @step T2 "T2 tries for lock 7: false. T1's session still holds it, transaction or not."
SELECT pg_try_advisory_lock(7);

-- @step T1 "only an explicit unlock (or the session ending) lets it go."
SELECT pg_advisory_unlock(7);

-- @step T2 "now T2 gets it."
SELECT pg_try_advisory_lock(7);
