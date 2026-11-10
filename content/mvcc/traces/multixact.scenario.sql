-- @title two transactions take FOR SHARE on the same row, and xmax becomes a MultiXact; a writer waits for both
-- @ext pgrowlocks
-- @sessions T1 T2 T3
-- @each xids locks heap(accounts)

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 locks alice's row FOR SHARE. a row lock is written into the tuple itself: T1 gets an xid, and it goes into xmax, marked lock-only."
BEGIN;
SELECT owner FROM accounts WHERE id = 1 FOR SHARE;

-- @step T2 "T2 takes FOR SHARE on the same row. share locks don't conflict, but xmax has room for one id. so postgres makes a MultiXact, a new id that stands for both lockers, and puts that in xmax."
BEGIN;
SELECT owner FROM accounts WHERE id = 1 FOR SHARE;

-- @step obs "pgrowlocks reads the row's xmax and expands the MultiXact into its members."
SELECT locked_row, locker, multi, xids, modes FROM pgrowlocks('accounts');

-- @step obs "the same, straight from the MultiXact: one row per member transaction, with its lock mode."
SELECT * FROM pg_get_multixact_members('1');

-- @step T3 blocks "T3 wants to update the row. it waits for every member, one at a time."
UPDATE accounts SET balance = balance + 1 WHERE id = 1;

-- @step T1 "T1 commits. one member is gone, but T2 still holds its share lock, so T3 keeps waiting."
COMMIT;

-- @step T2 "T2 commits too. T3 gets the row and writes its new version, with its own xid as the old version's xmax."
COMMIT;
