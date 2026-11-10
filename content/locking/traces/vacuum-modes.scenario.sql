-- @title VACUUM next to a reader, then VACUUM FULL next to the same reader
-- @sessions T1 T2
-- @each locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 reads accounts in an open transaction: ACCESS SHARE."
BEGIN;
SELECT sum(balance) FROM accounts;

-- @step T2 "plain VACUUM takes SHARE UPDATE EXCLUSIVE. no conflict with a reader: it runs right away."
VACUUM accounts;

-- @step T2 blocks "VACUUM FULL rewrites the table, so it wants ACCESS EXCLUSIVE, and waits for the reader."
VACUUM FULL accounts;

-- @step T1 "T1 ends, and VACUUM FULL gets its lock."
COMMIT;
