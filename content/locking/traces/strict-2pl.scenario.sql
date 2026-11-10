-- @title postgres and two-phase locking: reads take no row locks, writes keep theirs until commit
-- @sessions T1 T2
-- @each locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 opens a transaction and reads alice. the only locks are on the table and its index (ACCESS SHARE) and T1's own virtual xid. nothing on the row."
BEGIN;
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 updates alice right away. no wait: T1's read left nothing on the row to wait for."
UPDATE accounts SET balance = balance + 5 WHERE id = 1;

-- @step T1 "T1 updates bob. now it holds ROW EXCLUSIVE on the table and an exclusive lock on its new transaction id, which is what anyone wanting bob's row will wait for."
UPDATE accounts SET balance = balance - 10 WHERE id = 2;

-- @step T1 "the statement is over, and T1 holds everything it took. postgres never lets go of a lock in the middle of a transaction."
SELECT owner FROM accounts WHERE id = 2;

-- @step T2 blocks "T2 wants bob's row, so it waits for T1's transaction id."
UPDATE accounts SET balance = balance + 10 WHERE id = 2;

-- @step T1 "COMMIT releases every lock T1 held, all at once. T2 goes through."
COMMIT;
