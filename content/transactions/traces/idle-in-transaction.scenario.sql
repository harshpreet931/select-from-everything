-- @title idle in transaction: T1 updates a row and goes quiet, T2 waits behind it until the server ends T1's session
-- @sessions T1 T2
-- @session T1 idle_in_transaction_session_timeout=2s
-- @each locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 opens a transaction and takes 10.00 from alice. then the app goes off to call a payment API, and doesn't come back."
BEGIN;
UPDATE accounts SET balance = balance - 10.00 WHERE id = 1;

-- @step obs "the server's view: T1 is idle in transaction. it isn't running anything, but it still holds alice's row."
SELECT application_name AS session, state, wait_event_type
FROM pg_stat_activity
WHERE application_name IN ('T1', 'T2')
ORDER BY 1;

-- @step T2 blocks "T2 wants to add 5.00 to alice, and waits for T1."
UPDATE accounts SET balance = balance + 5.00 WHERE id = 1;

-- @step obs "now T2 is active, waiting on a lock, behind a session that is doing nothing at all."
SELECT application_name AS session, state, wait_event_type
FROM pg_stat_activity
WHERE application_name IN ('T1', 'T2')
ORDER BY 1;

-- @step obs +log "T1's session has a 2 s limit on sitting idle inside a transaction. a few seconds later the server ends the session, rolls its transaction back, and T2 gets the row."
SELECT pg_sleep(3);

-- @step obs "T1 is gone from pg_stat_activity."
SELECT application_name AS session, state
FROM pg_stat_activity
WHERE application_name IN ('T1', 'T2')
ORDER BY 1;

-- @step T2 "alice has 105.00: T2's 5.00 went in, and T1's withdrawal never happened."
SELECT balance FROM accounts WHERE id = 1;
