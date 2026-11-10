-- @title a row lock lives in the row. the lock table only hears about it when someone waits
-- @sessions T1 T2 T3
-- @ext pgrowlocks
-- @each locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 +xids +heap(accounts) "T1 locks alice's row FOR UPDATE. pg_locks shows T1's transaction id and its table lock, and nothing about the row: the lock is T1's xid, written into the row's xmax."
BEGIN;
SELECT id FROM accounts WHERE id = 1 FOR UPDATE;

-- @step obs "pgrowlocks reads the page and reports what xmax says: row (0,1), locked by T1's xid, For Update."
SELECT locked_row, locker, multi, xids, modes FROM pgrowlocks('accounts');

-- @step T2 blocks "T2 wants the same row. it takes the tuple lock (granted: T2 is first in line) and waits for T1's transaction to end."
BEGIN;
SELECT id FROM accounts WHERE id = 1 FOR UPDATE;

-- @step T3 blocks "T3 wants it too. the tuple lock is the queue: T3 waits for it, behind T2."
BEGIN;
SELECT id FROM accounts WHERE id = 1 FOR UPDATE;

-- @step T1 "T1 commits. T2 gets the row and lets go of the tuple lock. T3 takes the tuple lock and now waits on T2's transaction id."
COMMIT;

-- @step T2 "T2 commits, and T3 gets the row. the order was the tuple lock's queue: first come, first served."
COMMIT;

-- @step T3 "T3 commits. no locks left anywhere."
COMMIT;
