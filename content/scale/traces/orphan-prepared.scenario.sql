-- @title a prepared transaction outlives its session and a restart, keeps its row lock, and pins the xmin horizon
-- @sessions T1 T2
-- @server max_prepared_transactions=10 log_min_messages=info
-- @each

-- two-phase-commit reads this file. PREPARE TRANSACTION needs max_prepared_transactions > 0, which
-- the browser's postgres doesn't have (it's 0 there), so this runs on a native server. T1 plays a
-- participant whose coordinator never comes back. the prepared timestamp is left out: it changes
-- every run.

-- @setup
CREATE TABLE accounts (id int PRIMARY KEY, owner text NOT NULL, balance numeric(12,2) NOT NULL);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
CREATE TABLE counters (id int PRIMARY KEY, n int NOT NULL);
INSERT INTO counters VALUES (1, 0);
VACUUM accounts;
VACUUM counters;

-- @step T1 "T1 starts the local half of a transfer: alice pays 50.00."
BEGIN;

-- @step T1 +xids "T1 updates alice's row. it now holds a row lock and has a transaction id."
UPDATE accounts SET balance = balance - 50.00 WHERE id = 1;

-- @step T1 +xids +locks "phase one: PREPARE TRANSACTION. the work is on disk and T1's session is free again, but the transaction isn't over."
PREPARE TRANSACTION 'transfer-7';

-- @step obs "pg_prepared_xacts lists it: a transaction with no session attached."
SELECT gid, transaction::text AS xid, owner, database FROM pg_prepared_xacts;

-- @step obs "a checkpoint, so the crash below has little WAL to replay."
CHECKPOINT;

-- @crash "the whole server goes down before the coordinator sends phase two."
-- @restart +log "the server comes back and runs crash recovery."

-- @step obs "the prepared transaction is still there. recovery brought it back, still undecided."
SELECT gid, transaction::text AS xid, owner, database FROM pg_prepared_xacts;

-- @step obs "its locks are still held, by a transaction with no process behind it (pid is null)."
SELECT locktype, relation::regclass AS relation, mode, granted
FROM pg_locks
WHERE pid IS NULL AND locktype IN ('relation', 'transactionid')
ORDER BY locktype, relation::regclass::text NULLS LAST, mode;

-- @step T2 errors=55P03 "T2 wants alice's row. it waits for a transaction nobody is running, until its lock_timeout gives up."
SET lock_timeout = '200ms';
UPDATE accounts SET balance = balance + 1.00 WHERE id = 1;

-- @step obs "meanwhile, ordinary traffic updates a counter three times."
UPDATE counters SET n = n + 1 WHERE id = 1;
UPDATE counters SET n = n + 1 WHERE id = 1;
UPDATE counters SET n = n + 1 WHERE id = 1;

-- @step obs +log "VACUUM can't remove the three dead versions: the prepared transaction's xid holds the xmin horizon back."
VACUUM (VERBOSE) counters;

-- @step obs "someone finally decides. phase two: COMMIT PREPARED, from any session."
COMMIT PREPARED 'transfer-7';

-- @step obs +log "now the horizon moves, and VACUUM removes them."
VACUUM (VERBOSE) counters;

-- @step T1 "the transfer's half is in. T2's update never happened: it gave up."
SELECT id, owner, balance FROM accounts ORDER BY id;
