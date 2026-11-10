-- @title lost update, prevented: SELECT ... FOR UPDATE makes the second reader wait
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

-- @step T1 "T1 wants to add 10."
BEGIN;

-- @step T1 "it reads with FOR UPDATE: 100.00, and the row is now locked."
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;

-- @step T2 "T2 wants to add 20."
BEGIN;

-- @step T2 blocks "T2's read waits: FOR UPDATE asks for the same row lock."
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;

-- @step T1 "T1 writes 110.00."
UPDATE accounts SET balance = 110.00 WHERE id = 1;

-- @step T1 "T1 commits. T2's read wakes up and returns 110.00, the latest version."
COMMIT;

-- @step T2 "T2 computes 110.00 + 20 and writes 130.00."
UPDATE accounts SET balance = 130.00 WHERE id = 1;

-- @step T2 "T2 commits."
COMMIT;

-- @step T1 "alice has 130.00. both deposits made it."
SELECT balance FROM accounts WHERE id = 1;
