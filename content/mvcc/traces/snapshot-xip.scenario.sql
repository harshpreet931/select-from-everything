-- @title two writers, one still running, and two readers: a repeatable read snapshot that stays, a read committed one that moves
-- @sessions T1 T2 T3 T4
-- @each xids heap(accounts)

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 starts a transfer into alice's account and gets the first xid. it stays open."
BEGIN;
UPDATE accounts SET balance = balance + 10 WHERE id = 1;

-- @step T2 "T2 changes bob's balance and gets the next xid."
BEGIN;
UPDATE accounts SET balance = balance - 10 WHERE id = 2;

-- @step T2 "T2 commits. T1 is still running."
COMMIT;

-- @step T3 "T3, at repeatable read, reads alice and takes its snapshot with that first query: T1 is in the in-progress list, T2 is done."
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 1;

-- @step T4 "T4, at read committed, reads alice too. its snapshot says the same thing, for now."
BEGIN;
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 commits."
COMMIT;

-- @step T3 "T3 reads again with the same snapshot. T1 is still in progress as far as T3 is concerned, so alice is still 100.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T4 "T4 reads again. read committed takes a fresh snapshot for every statement, and this one has T1 committed: 110.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step obs "a snapshot from outside, written the way postgres prints it: xmin:xmax:in-progress list. nothing is running now."
SELECT pg_current_snapshot();
