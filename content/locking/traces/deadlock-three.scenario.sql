-- @title a three-way deadlock: alice → bob → carol → alice
-- @sessions T1 T2 T3
-- @session T1 deadlock_timeout=10s
-- @session T2 deadlock_timeout=10s
-- @session T3 deadlock_timeout=10ms
-- @each locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00), (3, 'carol', 100.00);
VACUUM accounts;

-- @step T1 +xids "T1 moves money out of alice: it holds alice's row."
BEGIN;
UPDATE accounts SET balance = balance - 10 WHERE id = 1;

-- @step T2 +xids "T2 moves money out of bob: it holds bob's row."
BEGIN;
UPDATE accounts SET balance = balance - 10 WHERE id = 2;

-- @step T3 +xids "T3 moves money out of carol: it holds carol's row."
BEGIN;
UPDATE accounts SET balance = balance - 10 WHERE id = 3;

-- @step T1 blocks "T1 pays bob. bob's row is T2's, so T1 waits for T2. its deadlock_timeout is 10 s, so it won't check for a long while."
UPDATE accounts SET balance = balance + 10 WHERE id = 2;

-- @step T2 blocks "T2 pays carol, and waits for T3. a chain, not a cycle yet. T2's timeout is 10 s too."
UPDATE accounts SET balance = balance + 10 WHERE id = 3;

-- @step T3 errors=40P01 "T3 pays alice and waits for T1: the chain closes into a cycle. 10 ms later T3's timer fires, it walks the graph, finds the cycle, and cancels itself."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;

-- @step T3 "T3 rolls back. its row locks go, so T2 gets carol's row."
ROLLBACK;

-- @step T2 "T2 commits, so T1 gets bob's row."
COMMIT;

-- @step T1 "T1 commits. two transfers happened, T3's has to be retried."
COMMIT;
