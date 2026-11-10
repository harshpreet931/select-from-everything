-- @title read committed: an UPDATE waits for a locked row, then re-checks its WHERE on the new version
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

-- @step T2 blocks "T2 pays a 10.00 bonus to every account with at least 100.00. its snapshot says alice has 100.00, so she matches, but her row is locked. T2 waits."
UPDATE accounts SET balance = balance + 10.00 WHERE balance >= 100.00;

-- @step T1 "T1 commits. T2 wakes up, reads alice's row as T1 left it (50.00), checks its WHERE again on that version, and skips her. then it goes on to bob."
COMMIT;

-- @step T2 "UPDATE 1: only bob got the bonus. alice matched when T2 started, and didn't by the time it got her row."
SELECT id, owner, balance FROM accounts ORDER BY id;
