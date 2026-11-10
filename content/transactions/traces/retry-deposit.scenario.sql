-- @title two deposits at repeatable read, with a retry: the second attempt reads the first one's balance
-- @sessions T1 T2
-- @each xids heap(accounts)

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 deposits 10.00 at repeatable read: it reads 100.00."
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 deposits 20.00 the same way: it also reads 100.00."
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 writes 110.00."
UPDATE accounts SET balance = 110.00 WHERE id = 1;

-- @step T2 blocks errors=40001 "T2 writes 120.00 and waits for T1."
UPDATE accounts SET balance = 120.00 WHERE id = 1;

-- @step T1 "T1 commits. T2 wakes up to 40001."
COMMIT;

-- @step T2 errors=25P02 "a loop around just the UPDATE would send it again, in the same transaction. refused: the transaction is already aborted."
UPDATE accounts SET balance = 120.00 WHERE id = 1;

-- @step T2 "the right loop rolls T2 back, the whole transaction."
ROLLBACK;

-- @step T2 "attempt 2, from the top. a new transaction, so a new snapshot."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 "the read runs again and sees T1's commit: 110.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "110.00 + 20.00: T2 writes 130.00. nobody holds the row now."
UPDATE accounts SET balance = 130.00 WHERE id = 1;

-- @step T2 "T2 commits."
COMMIT;

-- @step T1 "130.00. both deposits, one of them on its second try."
SELECT balance FROM accounts WHERE id = 1;
