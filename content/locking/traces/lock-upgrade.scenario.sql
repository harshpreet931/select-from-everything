-- @title a lock upgrade deadlock: two readers both decide to ALTER the table
-- @sessions T1 T2
-- @session T1 deadlock_timeout=10s
-- @session T2 deadlock_timeout=10ms
-- @each locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 reads accounts: ACCESS SHARE."
BEGIN;
SELECT count(*) FROM accounts;

-- @step T2 "T2 reads accounts too. two ACCESS SHAREs, no problem."
BEGIN;
SELECT count(*) FROM accounts;

-- @step T1 blocks "T1 now wants to change the table: ACCESS EXCLUSIVE. it keeps its ACCESS SHARE and waits for T2's."
ALTER TABLE accounts ADD COLUMN note text;

-- @step T2 errors=40P01 "T2 wants the same upgrade. it waits for T1's ACCESS SHARE, T1 waits for T2's: a deadlock. T2's check runs first and cancels T2."
ALTER TABLE accounts ADD COLUMN memo text;

-- @step T2 "T2 rolls back, and T1's ALTER goes through."
ROLLBACK;

-- @step T1 "T1 commits."
COMMIT;
