-- @title the same two transfers, both locking the lower account id first: a wait, no deadlock
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

-- @step T1 "T1 moves 10 from alice to bob. alice is account 1, the lower id, so it goes first anyway."
BEGIN;

-- @step T1 "it takes 10 from alice, and holds alice's row."
UPDATE accounts SET balance = balance - 10 WHERE id = 1;

-- @step T2 "T2 moves 30 from bob to alice. it touches the lower id first too: alice's side before bob's."
BEGIN;

-- @step T2 blocks "it wants alice's row first, and T1 has it. T2 waits, holding nothing T1 needs."
UPDATE accounts SET balance = balance + 30 WHERE id = 1;

-- @step T1 "T1 takes bob's row. nobody holds it."
UPDATE accounts SET balance = balance + 10 WHERE id = 2;

-- @step T1 "T1 commits. T2 wakes up and adds its 30 to alice."
COMMIT;

-- @step T2 "T2 takes 30 from bob."
UPDATE accounts SET balance = balance - 30 WHERE id = 2;

-- @step T2 "T2 commits."
COMMIT;

-- @step T1 "alice 120.00, bob 80.00: both transfers happened. one wait, no cycle, nobody killed."
SELECT id, owner, balance FROM accounts ORDER BY id;
