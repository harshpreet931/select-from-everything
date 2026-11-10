-- @title deadlock: two transfers in opposite directions
-- @sessions T1 T2
-- @session T1 deadlock_timeout=10s
-- @session T2 deadlock_timeout=10ms
-- @each xids locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 moves 10 from alice to bob."
BEGIN;

-- @step T1 "it takes 10 from alice, and holds alice's row."
UPDATE accounts SET balance = balance - 10 WHERE id = 1;

-- @step T2 "T2 moves 30 from bob to alice."
BEGIN;

-- @step T2 "it takes 30 from bob, and holds bob's row."
UPDATE accounts SET balance = balance - 30 WHERE id = 2;

-- @step T1 blocks "T1 wants bob's row. T2 has it, so T1 waits for T2."
UPDATE accounts SET balance = balance + 10 WHERE id = 2;

-- @step T2 errors=40P01 "T2 wants alice's row. T1 has it, and T1 is waiting for T2: a cycle. T2 has waited its deadlock_timeout (10 ms here), so it checks, finds the cycle, and cancels itself: 40P01."
UPDATE accounts SET balance = balance + 30 WHERE id = 1;

-- @step T2 "T2's transaction is aborted. T1 got bob's row the moment T2's locks went away."
ROLLBACK;

-- @step T1 "T1 finishes its transfer."
COMMIT;

-- @step T1 "alice 90.00, bob 110.00: T1's transfer happened, T2's has to be retried."
SELECT id, owner, balance FROM accounts ORDER BY id;
