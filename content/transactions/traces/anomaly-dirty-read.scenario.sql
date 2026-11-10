-- @title dirty read, tried at all four isolation levels: T2 reads a balance T1 changed but never committed
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

-- @step T1 "read uncommitted. T1 opens a transaction."
BEGIN;

-- @step T1 "T1 withdraws alice's 100.00. alice is at 0.00, but only inside T1: nothing is committed."
UPDATE accounts SET balance = balance - 100.00 WHERE id = 1;

-- @step T2 "T2 asks for read uncommitted."
BEGIN ISOLATION LEVEL READ UNCOMMITTED;

-- @step T2 "T2 checks which level it got: read uncommitted."
SHOW transaction_isolation;

-- @step T2 "T2 reads alice: 100.00, the committed value. the standard would let it see T1's 0.00 here. postgres doesn't."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 changes its mind and rolls back. the 0.00 never existed, and nobody saw it."
ROLLBACK;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level."
SELECT 1;

-- @step T1 "read committed. T1 opens a transaction."
BEGIN;

-- @step T1 "T1 withdraws alice's 100.00. alice is at 0.00, but only inside T1: nothing is committed."
UPDATE accounts SET balance = balance - 100.00 WHERE id = 1;

-- @step T2 "T2 asks for read committed."
BEGIN ISOLATION LEVEL READ COMMITTED;

-- @step T2 "T2 checks which level it got: read committed."
SHOW transaction_isolation;

-- @step T2 "T2 reads alice: 100.00, the committed value. T1's 0.00 is invisible to it."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 changes its mind and rolls back. the 0.00 never existed, and nobody saw it."
ROLLBACK;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level."
SELECT 1;

-- @step T1 "repeatable read. T1 opens a transaction."
BEGIN;

-- @step T1 "T1 withdraws alice's 100.00. alice is at 0.00, but only inside T1: nothing is committed."
UPDATE accounts SET balance = balance - 100.00 WHERE id = 1;

-- @step T2 "T2 asks for repeatable read."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 "T2 checks which level it got: repeatable read."
SHOW transaction_isolation;

-- @step T2 "T2 reads alice: 100.00, the committed value. T1's 0.00 is invisible to it."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 changes its mind and rolls back. the 0.00 never existed, and nobody saw it."
ROLLBACK;

-- @step T2 "T2 finishes."
COMMIT;

-- @step obs "next level."
SELECT 1;

-- @step T1 "serializable. T1 opens a transaction."
BEGIN;

-- @step T1 "T1 withdraws alice's 100.00. alice is at 0.00, but only inside T1: nothing is committed."
UPDATE accounts SET balance = balance - 100.00 WHERE id = 1;

-- @step T2 "T2 asks for serializable."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T2 "T2 checks which level it got: serializable."
SHOW transaction_isolation;

-- @step T2 "T2 reads alice: 100.00, the committed value. T1's 0.00 is invisible to it."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 changes its mind and rolls back. the 0.00 never existed, and nobody saw it."
ROLLBACK;

-- @step T2 "T2 finishes."
COMMIT;

