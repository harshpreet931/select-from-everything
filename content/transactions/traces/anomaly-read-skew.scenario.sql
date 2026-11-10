-- @title read skew at all four isolation levels: T2 adds up alice and bob while T1 moves 50.00 between them
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

-- @step T2 "read uncommitted. T2 wants alice + bob, which is always 200.00."
BEGIN ISOLATION LEVEL READ UNCOMMITTED;

-- @step T2 "T2 reads alice: 100.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 moves 50.00 from alice to bob, in one transaction."
BEGIN;
UPDATE accounts SET balance = balance - 50.00 WHERE id = 1;
UPDATE accounts SET balance = balance + 50.00 WHERE id = 2;

-- @step T1 "T1 commits. alice 50.00, bob 150.00, still 200.00 in total."
COMMIT;

-- @step T2 "T2 reads bob: 150.00. so T2 thinks there's 100.00 + 150.00 = 250.00. that total never existed."
SELECT balance FROM accounts WHERE id = 2;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level. both balances go back to 100.00."
UPDATE accounts SET balance = 100.00;

-- @step T2 "read committed. T2 wants alice + bob, which is always 200.00."
BEGIN ISOLATION LEVEL READ COMMITTED;

-- @step T2 "T2 reads alice: 100.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 moves 50.00 from alice to bob, in one transaction."
BEGIN;
UPDATE accounts SET balance = balance - 50.00 WHERE id = 1;
UPDATE accounts SET balance = balance + 50.00 WHERE id = 2;

-- @step T1 "T1 commits. alice 50.00, bob 150.00, still 200.00 in total."
COMMIT;

-- @step T2 "T2 reads bob: 150.00. so T2 thinks there's 100.00 + 150.00 = 250.00. that total never existed."
SELECT balance FROM accounts WHERE id = 2;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level. both balances go back to 100.00."
UPDATE accounts SET balance = 100.00;

-- @step T2 "repeatable read. T2 wants alice + bob, which is always 200.00."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 "T2 reads alice: 100.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 moves 50.00 from alice to bob, in one transaction."
BEGIN;
UPDATE accounts SET balance = balance - 50.00 WHERE id = 1;
UPDATE accounts SET balance = balance + 50.00 WHERE id = 2;

-- @step T1 "T1 commits. alice 50.00, bob 150.00, still 200.00 in total."
COMMIT;

-- @step T2 "T2 reads bob: 100.00, from the same snapshot as alice. 200.00, a total that really existed."
SELECT balance FROM accounts WHERE id = 2;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level. both balances go back to 100.00."
UPDATE accounts SET balance = 100.00;

-- @step T2 "serializable. T2 wants alice + bob, which is always 200.00."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T2 "T2 reads alice: 100.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 moves 50.00 from alice to bob, in one transaction."
BEGIN;
UPDATE accounts SET balance = balance - 50.00 WHERE id = 1;
UPDATE accounts SET balance = balance + 50.00 WHERE id = 2;

-- @step T1 "T1 commits. alice 50.00, bob 150.00, still 200.00 in total."
COMMIT;

-- @step T2 "T2 reads bob: 100.00, from the same snapshot as alice. 200.00, a total that really existed."
SELECT balance FROM accounts WHERE id = 2;

-- @step T2 "T2 finishes."
COMMIT;

