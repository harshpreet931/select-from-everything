-- @title CREATE INDEX blocks writers, CREATE INDEX CONCURRENTLY doesn't (but it waits for old transactions)
-- @sessions T1 T2 T3
-- @each locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 builds an index inside a transaction, so its lock stays visible. CREATE INDEX takes SHARE on the table."
BEGIN;
CREATE INDEX accounts_owner ON accounts (owner);

-- @step T2 "a read: ACCESS SHARE doesn't conflict with SHARE, so readers carry on."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 blocks "a write: UPDATE wants ROW EXCLUSIVE, which conflicts with SHARE. writers wait for the whole build."
UPDATE accounts SET balance = balance + 1 WHERE id = 1;

-- @step T1 "T1 commits, and T2's update goes through."
COMMIT;

-- @step obs "round two: CREATE INDEX CONCURRENTLY."
DROP INDEX accounts_owner;

-- @step T1 "T1 is a transaction that wrote to accounts and hasn't committed yet."
BEGIN;
UPDATE accounts SET balance = balance - 1 WHERE id = 1;

-- @step T2 blocks "CREATE INDEX CONCURRENTLY takes SHARE UPDATE EXCLUSIVE, which lets writes in. but first it waits for every transaction that could still write to the table without seeing the new index: here, T1. it waits on T1's virtual xid."
CREATE INDEX CONCURRENTLY accounts_owner ON accounts (owner);

-- @step T3 "meanwhile a writer goes straight through. ROW EXCLUSIVE and SHARE UPDATE EXCLUSIVE don't conflict."
UPDATE accounts SET balance = balance + 1 WHERE id = 2;

-- @step T1 "T1 ends, and the concurrent build finishes."
COMMIT;
