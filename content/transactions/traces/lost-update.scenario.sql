-- @title lost update: read, compute in the app, write back, at read committed
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

-- @step T1 "T1 wants to add 10 to alice's balance."
BEGIN;

-- @step T1 "it reads 100.00 and computes 110.00 in the app."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 wants to add 20."
BEGIN;

-- @step T2 "it also reads 100.00, and computes 120.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 writes its answer. the row is now locked by T1."
UPDATE accounts SET balance = 110.00 WHERE id = 1;

-- @step T2 blocks "T2 writes too, and has to wait for T1."
UPDATE accounts SET balance = 120.00 WHERE id = 1;

-- @step T1 "T1 commits. T2 wakes up and writes 120.00 over T1's 110.00."
COMMIT;

-- @step T2 "T2 commits."
COMMIT;

-- @step T1 "alice should have 130.00. she has 120.00: T1's +10 is gone, and nobody got an error."
SELECT balance FROM accounts WHERE id = 1;
