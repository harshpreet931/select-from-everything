-- @title repeatable read takes its snapshot at the first statement, not at BEGIN
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

-- @step T2 "T2 begins a repeatable read transaction. no snapshot yet: BEGIN doesn't take one."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T1 "T1 sets alice to 150.00 and commits, after T2's BEGIN."
UPDATE accounts SET balance = 150.00 WHERE id = 1;

-- @step T2 "T2's first statement takes the snapshot, now. T1 has committed, so T2 sees 150.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 sets alice to 200.00 and commits."
UPDATE accounts SET balance = 200.00 WHERE id = 1;

-- @step T2 "T2 reads again, from the snapshot it already has: still 150.00."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "T2 ends."
COMMIT;
