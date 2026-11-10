-- @title T1 begins first and T2 writes first: xids are handed out at the first write, not at BEGIN
-- @sessions T1 T2
-- @each xids locks heap(accounts)

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 begins. it holds a virtual xid, a number only this server's lock table knows. no real xid yet."
BEGIN;

-- @step T1 "T1 reads. reading never needs an xid, so it still has none."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 begins, after T1."
BEGIN;

-- @step T2 "T2 writes first, so T2 gets the next xid. it goes into the new version's xmin and the old version's xmax."
UPDATE accounts SET balance = balance - 10 WHERE id = 2;

-- @step T1 "now T1 writes, and gets the xid after T2's. xids are in the order of first writes, not of BEGINs."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;

-- @step T2 "T2 rolls back. nothing on the page changes: its version stays, its xid is just marked aborted in the commit log."
ROLLBACK;

-- @step T1 "T1 commits. same thing: the page doesn't change, the commit log does."
COMMIT;

-- @step obs "a new reader. bob's old version is back, with xmax still holding T2's aborted xid. an xmax that isn't 0 doesn't mean deleted."
SELECT ctid, xmin, xmax, owner, balance FROM accounts ORDER BY id;
