-- @title lost update, prevented: repeatable read refuses the second write
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

-- @step T1 "T1 wants to add 10, at repeatable read."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T1 "it reads 100.00 and computes 110.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 wants to add 20, also at repeatable read."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 "it reads 100.00 and computes 120.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 writes 110.00."
UPDATE accounts SET balance = 110.00 WHERE id = 1;

-- @step T2 blocks errors=40001 "T2 tries to write and waits for T1."
UPDATE accounts SET balance = 120.00 WHERE id = 1;

-- @step T1 "T1 commits. T2 wakes up to a row changed after its snapshot, and gets 40001 instead of overwriting it."
COMMIT;

-- @step T2 "T2 has to roll back. the app should retry the whole transaction."
ROLLBACK;

-- @step T1 "alice has 110.00. T2's +20 didn't happen yet, but it wasn't silently lost either."
SELECT balance FROM accounts WHERE id = 1;
