-- @title one session through a transaction, with pg_stat_activity's state read after every statement
-- @sessions T1
-- @each

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL CHECK (balance >= 0)
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00), (3, 'carol', 0.00);
VACUUM accounts;

-- @step obs "T1 is connected, between statements, not in a transaction."
SELECT state FROM pg_stat_activity WHERE application_name = 'T1';

-- @step T1 "BEGIN opens a transaction block."
BEGIN;

-- @step obs "between statements now, but inside a transaction."
SELECT state FROM pg_stat_activity WHERE application_name = 'T1';

-- @step T1 "T1 updates alice. the transaction holds her row until it ends."
UPDATE accounts SET balance = balance + 50.00 WHERE id = 1;

-- @step obs "still idle in transaction, now holding a row lock."
SELECT state FROM pg_stat_activity WHERE application_name = 'T1';

-- @step T1 errors=23514 "T1 takes 50.00 from carol, who has 0.00. the CHECK says no."
UPDATE accounts SET balance = balance - 50.00 WHERE id = 3;

-- @step obs "the transaction is still open, but it's aborted."
SELECT state FROM pg_stat_activity WHERE application_name = 'T1';

-- @step T1 errors=25P02 "anything else T1 sends is refused, even a plain read."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "COMMIT ends it. the reply is ROLLBACK, and alice's 50.00 goes with it."
COMMIT;

-- @step obs "back to idle."
SELECT state FROM pg_stat_activity WHERE application_name = 'T1';
