-- @title one transaction on the lab accounts table: the WAL record first, the page later
-- @engine pglite
-- @db lab
-- @each wal buffers heap(accounts)

-- @setup
SELECT count(*) FROM accounts;

-- @step T1 "a transaction starts. nothing is written yet."
BEGIN;

-- @step T1 "alice's balance changes. the page in shared buffers changes and its pd_lsn moves to the end of the new WAL record. the record is in wal_buffers, past the flush line."
UPDATE accounts SET balance = balance - 25.00 WHERE id = 1;

-- @step T1 "bob's too. same page, one more record. still nothing on disk: not the WAL, not the page."
UPDATE accounts SET balance = balance + 25.00 WHERE id = 2;

-- @step T1 "COMMIT appends its own record and flushes the WAL up to the end of it. that's the only write COMMIT waits for. the page stays dirty in memory."
COMMIT;

-- @step T1 "CHECKPOINT writes the dirty page to the table's file, long after the WAL describing it was safe on disk."
CHECKPOINT;
