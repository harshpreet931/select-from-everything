-- @title T1 updates a balance twice while T2, at repeatable read, keeps reading
-- @sessions T1 T2
-- @each xids heap(accounts) btree(accounts_pkey)

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T2 "T2 opens a repeatable read transaction. no snapshot yet: BEGIN doesn't take one."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 "T2's first read takes its snapshot. alice has 100.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 starts. still no xid: it hasn't written anything."
BEGIN;

-- @step T1 "the first write gets T1 an xid. the old version keeps its place, with T1's xid in xmax. the new one goes in a free slot."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;

-- @step T1 "again. now there are three versions of alice on the page, and only the last one has no xmax."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;

-- @step T2 "T2 still reads 100.00. T1 is in progress, so neither new version is visible to anyone else."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 commits. nothing on the page changes: whether 759 committed is kept in the commit log (pg_xact), not in the tuples."
COMMIT;

-- @step T2 "T2 still reads 100.00. T1 committed after T2's snapshot was taken, so for T2 it's as if it never happened."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 ends."
COMMIT;

-- @step T2 "a new transaction gets a new snapshot, and sees 120.00. checking the versions also stamps hint bits into their headers, which is why they light up."
SELECT balance FROM accounts WHERE id = 1;

-- @step obs "VACUUM. nobody can see the two old versions anymore, so they go. the index still points at slot 1, so slot 1 stays, as a redirect to the live version."
VACUUM accounts;
