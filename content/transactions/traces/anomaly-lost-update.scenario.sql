-- @title lost update at all four isolation levels: two deposits, each read, computed in the app and written back
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

-- @step T1 "read uncommitted. T1 will deposit 10.00."
BEGIN ISOLATION LEVEL READ UNCOMMITTED;

-- @step T1 "T1 reads 100.00 and works out 110.00 in the app."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 will deposit 20.00, at the same level."
BEGIN ISOLATION LEVEL READ UNCOMMITTED;

-- @step T2 "T2 also reads 100.00 and works out 120.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 writes 110.00 and now holds the row."
UPDATE accounts SET balance = 110.00 WHERE id = 1;

-- @step T2 blocks "T2 writes 120.00 and waits for T1's row lock."
UPDATE accounts SET balance = 120.00 WHERE id = 1;

-- @step T1 "T1 commits. T2 wakes up and writes its 120.00 over T1's 110.00."
COMMIT;

-- @step T2 "T2 commits. no error anywhere."
COMMIT;

-- @step T1 "both deposits should make 130.00. it's 120.00: T1's deposit is gone."
SELECT balance FROM accounts WHERE id = 1;

-- @step obs "next level. alice goes back to 100.00."
UPDATE accounts SET balance = 100.00 WHERE id = 1;

-- @step T1 "read committed. T1 will deposit 10.00."
BEGIN ISOLATION LEVEL READ COMMITTED;

-- @step T1 "T1 reads 100.00 and works out 110.00 in the app."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 will deposit 20.00, at the same level."
BEGIN ISOLATION LEVEL READ COMMITTED;

-- @step T2 "T2 also reads 100.00 and works out 120.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 writes 110.00 and now holds the row."
UPDATE accounts SET balance = 110.00 WHERE id = 1;

-- @step T2 blocks "T2 writes 120.00 and waits for T1's row lock."
UPDATE accounts SET balance = 120.00 WHERE id = 1;

-- @step T1 "T1 commits. T2 wakes up and writes its 120.00 over T1's 110.00."
COMMIT;

-- @step T2 "T2 commits. no error anywhere."
COMMIT;

-- @step T1 "both deposits should make 130.00. it's 120.00: T1's deposit is gone."
SELECT balance FROM accounts WHERE id = 1;

-- @step obs "next level. alice goes back to 100.00."
UPDATE accounts SET balance = 100.00 WHERE id = 1;

-- @step T1 "repeatable read. T1 will deposit 10.00."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T1 "T1 reads 100.00 and works out 110.00 in the app."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 will deposit 20.00, at the same level."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 "T2 also reads 100.00 and works out 120.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 writes 110.00 and now holds the row."
UPDATE accounts SET balance = 110.00 WHERE id = 1;

-- @step T2 blocks errors=40001 "T2 writes 120.00 and waits for T1's row lock."
UPDATE accounts SET balance = 120.00 WHERE id = 1;

-- @step T1 "T1 commits. T2 wakes up to a row that changed after its snapshot, and gets 40001 instead of writing."
COMMIT;

-- @step T2 "T2's transaction is dead. it can only roll back, and retry from the top."
ROLLBACK;

-- @step T1 "110.00. T2's deposit didn't happen, but T2 knows it, and a retry reads 110.00 and writes 130.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step obs "next level. alice goes back to 100.00."
UPDATE accounts SET balance = 100.00 WHERE id = 1;

-- @step T1 "serializable. T1 will deposit 10.00."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T1 "T1 reads 100.00 and works out 110.00 in the app."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 will deposit 20.00, at the same level."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T2 "T2 also reads 100.00 and works out 120.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 writes 110.00 and now holds the row."
UPDATE accounts SET balance = 110.00 WHERE id = 1;

-- @step T2 blocks errors=40001 "T2 writes 120.00 and waits for T1's row lock."
UPDATE accounts SET balance = 120.00 WHERE id = 1;

-- @step T1 "T1 commits. T2 wakes up to a row that changed after its snapshot, and gets 40001 instead of writing."
COMMIT;

-- @step T2 "T2's transaction is dead. it can only roll back, and retry from the top."
ROLLBACK;

-- @step T1 "110.00. T2's deposit didn't happen, but T2 knows it, and a retry reads 110.00 and writes 130.00."
SELECT balance FROM accounts WHERE id = 1;

