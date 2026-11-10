-- @title phantom at all four isolation levels: T2 counts the accounts holding 100.00 or more, twice, while T1 opens a new one
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

-- @step T2 "T2 counts the accounts with at least 100.00: alice and bob, 2."
SELECT count(*) FROM accounts WHERE balance >= 100.00;

-- @step T1 "T1 opens carol's account with 100.00 and commits. a brand new row that matches T2's condition."
INSERT INTO accounts VALUES (3, 'carol', 100.00);

-- @step T2 "T2 runs the same count again: 3. a row appeared out of nowhere, a phantom."
SELECT count(*) FROM accounts WHERE balance >= 100.00;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level. carol's account goes away again."
DELETE FROM accounts WHERE id = 3;

-- @step T2 "read committed. T2 opens a transaction."
BEGIN ISOLATION LEVEL READ COMMITTED;

-- @step T2 "T2 counts the accounts with at least 100.00: alice and bob, 2."
SELECT count(*) FROM accounts WHERE balance >= 100.00;

-- @step T1 "T1 opens carol's account with 100.00 and commits. a brand new row that matches T2's condition."
INSERT INTO accounts VALUES (3, 'carol', 100.00);

-- @step T2 "T2 runs the same count again: 3. a row appeared out of nowhere, a phantom."
SELECT count(*) FROM accounts WHERE balance >= 100.00;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level. carol's account goes away again."
DELETE FROM accounts WHERE id = 3;

-- @step T2 "repeatable read. T2 opens a transaction."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 "T2 counts the accounts with at least 100.00: alice and bob, 2."
SELECT count(*) FROM accounts WHERE balance >= 100.00;

-- @step T1 "T1 opens carol's account with 100.00 and commits. a brand new row that matches T2's condition."
INSERT INTO accounts VALUES (3, 'carol', 100.00);

-- @step T2 "T2 runs the same count again: still 2. the standard allows a phantom at repeatable read. postgres's snapshot doesn't show one."
SELECT count(*) FROM accounts WHERE balance >= 100.00;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level. carol's account goes away again."
DELETE FROM accounts WHERE id = 3;

-- @step T2 "serializable. T2 opens a transaction."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T2 "T2 counts the accounts with at least 100.00: alice and bob, 2."
SELECT count(*) FROM accounts WHERE balance >= 100.00;

-- @step T1 "T1 opens carol's account with 100.00 and commits. a brand new row that matches T2's condition."
INSERT INTO accounts VALUES (3, 'carol', 100.00);

-- @step T2 "T2 runs the same count again: still 2."
SELECT count(*) FROM accounts WHERE balance >= 100.00;

-- @step T2 "T2 finishes."
COMMIT;

