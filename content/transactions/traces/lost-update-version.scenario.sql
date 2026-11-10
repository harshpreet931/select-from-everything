-- @title lost update, prevented: a version column checked in the UPDATE (optimistic locking)
-- @sessions T1 T2
-- @each xids locks heap(accounts)

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL,
  version int NOT NULL DEFAULT 0
);
INSERT INTO accounts VALUES (1, 'alice', 100.00, 0), (2, 'bob', 100.00, 0);
VACUUM accounts;

-- @step T1 "T1 reads alice's balance and version: 100.00, version 0. no transaction stays open while the app thinks."
SELECT balance, version FROM accounts WHERE id = 1;

-- @step T2 "T2 reads the same: 100.00, version 0."
SELECT balance, version FROM accounts WHERE id = 1;

-- @step T1 "T1 saves 110.00, only if the version is still 0, and bumps it to 1. UPDATE 1."
UPDATE accounts SET balance = 110.00, version = version + 1 WHERE id = 1 AND version = 0;

-- @step T2 "T2 saves 120.00 under the same condition. the version is 1 now, so no row matches: UPDATE 0. the app sees the 0 and knows its read is stale."
UPDATE accounts SET balance = 120.00, version = version + 1 WHERE id = 1 AND version = 0;

-- @step T1 "alice has 110.00, version 1. T2's deposit isn't lost: T2 knows it didn't happen, and re-reads."
SELECT balance, version FROM accounts WHERE id = 1;
