-- @title non-repeatable read at all four isolation levels: T2 reads alice twice while T1 changes her balance
-- @sessions T1 T2
-- @each xids

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T2 "read uncommitted. T2 opens a transaction."
BEGIN ISOLATION LEVEL READ UNCOMMITTED;

-- @step T2 "T2 reads alice: 100.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 sets alice to 150.00. one statement on its own, so it commits right away."
UPDATE accounts SET balance = 150.00 WHERE id = 1;

-- @step T2 "T2 reads alice again: 150.00. same query, same transaction, a different answer."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level. alice goes back to 100.00."
UPDATE accounts SET balance = 100.00 WHERE id = 1;

-- @step T2 "read committed. T2 opens a transaction."
BEGIN ISOLATION LEVEL READ COMMITTED;

-- @step T2 "T2 reads alice: 100.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 sets alice to 150.00. one statement on its own, so it commits right away."
UPDATE accounts SET balance = 150.00 WHERE id = 1;

-- @step T2 "T2 reads alice again: 150.00. same query, same transaction, a different answer."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level. alice goes back to 100.00."
UPDATE accounts SET balance = 100.00 WHERE id = 1;

-- @step T2 "repeatable read. T2 opens a transaction."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 "T2 reads alice: 100.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 sets alice to 150.00. one statement on its own, so it commits right away."
UPDATE accounts SET balance = 150.00 WHERE id = 1;

-- @step T2 "T2 reads alice again: still 100.00. it reads from the snapshot it took at its first query, before T1 committed."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level. alice goes back to 100.00."
UPDATE accounts SET balance = 100.00 WHERE id = 1;

-- @step T2 "serializable. T2 opens a transaction."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T2 "T2 reads alice: 100.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 sets alice to 150.00. one statement on its own, so it commits right away."
UPDATE accounts SET balance = 150.00 WHERE id = 1;

-- @step T2 "T2 reads alice again: still 100.00. it reads from the snapshot it took at its first query, before T1 committed."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 finishes."
COMMIT;

