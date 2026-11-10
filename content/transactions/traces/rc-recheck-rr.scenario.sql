-- @title the same bonus at repeatable read: the UPDATE waits for the locked row, then fails with 40001
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

-- @step T1 "T1 starts taking 50.00 out of alice's account."
BEGIN;

-- @step T1 "alice is at 50.00 inside T1. not committed, and T1 holds the row."
UPDATE accounts SET balance = balance - 50.00 WHERE id = 1;

-- @step T2 "T2 runs the bonus at repeatable read."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 blocks errors=40001 "every account with at least 100.00 gets 10.00. alice matches in T2's snapshot, her row is locked, T2 waits."
UPDATE accounts SET balance = balance + 10.00 WHERE balance >= 100.00;

-- @step T1 "T1 commits. T2 wakes up, but repeatable read can't move on to a version newer than its snapshot: 40001."
COMMIT;

-- @step T2 "T2 rolls back. nobody got a bonus, and the app has to run it again."
ROLLBACK;

-- @step T2 "alice 50.00, bob 100.00. a retry would start with a fresh snapshot and pay bob."
SELECT id, owner, balance FROM accounts ORDER BY id;
