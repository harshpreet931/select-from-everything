-- @title lost update, prevented: let the UPDATE do the arithmetic
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

-- @step T1 "T1 adds 10, in one statement, no read first."
BEGIN;

-- @step T1 "balance = balance + 10: the new value is computed from the row being updated."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;

-- @step T2 "T2 adds 20 the same way."
BEGIN;

-- @step T2 blocks "it waits for T1's row lock."
UPDATE accounts SET balance = balance + 20 WHERE id = 1;

-- @step T1 "T1 commits. T2 wakes up, re-reads the row T1 just wrote (110.00) and adds 20 to that."
COMMIT;

-- @step T2 "T2 commits."
COMMIT;

-- @step T1 "alice has 130.00, with no locking in the app at all."
SELECT balance FROM accounts WHERE id = 1;
