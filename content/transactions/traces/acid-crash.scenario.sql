-- @title a committed transfer and a half-done one, then the server is killed and restarted
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

-- @step obs "a checkpoint: every change so far is in the table files on disk. recovery will start from here."
CHECKPOINT;

-- @step T1 "T1 moves 50.00 from alice to bob."
BEGIN;
UPDATE accounts SET balance = balance - 50.00 WHERE id = 1;
UPDATE accounts SET balance = balance + 50.00 WHERE id = 2;

-- @step T1 "T1 commits. once COMMIT returns, the transfer's WAL is on disk."
COMMIT;

-- @step T2 "T2 starts moving 30.00 from bob to alice."
BEGIN;

-- @step T2 "it takes 30.00 from bob. alice's half hasn't run yet, and nothing is committed."
UPDATE accounts SET balance = balance - 30.00 WHERE id = 2;

-- @crash "the server dies mid-transaction: pg_ctl stop -m immediate. no checkpoint, no clean shutdown."

-- @restart +log "the server starts again and replays the WAL since the last checkpoint."

-- @step T1 "after the crash: T1's transfer is there, T2's half transfer is not. alice 50.00, bob 150.00."
SELECT id, owner, balance FROM accounts ORDER BY id;
