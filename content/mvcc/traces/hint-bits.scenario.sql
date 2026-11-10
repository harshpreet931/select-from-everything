-- @title a committed UPDATE, a checkpoint, then a plain SELECT that sets hint bits, dirties the page and writes WAL
-- @checksums
-- @server io_method=sync
-- @sessions T1 T2
-- @each xids buffers wal heap(accounts)

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;
CHECKPOINT;

-- @step T1 "T1 updates alice and commits. its xid goes into the tuples, and the commit goes into the WAL and the commit log. the tuples don't hear about it."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;

-- @step obs "a CHECKPOINT writes every dirty page out. the page on disk now has T1's xid in it and no hint that T1 committed."
CHECKPOINT;

-- @step T2 "T2 just reads alice. to judge the two versions it looks T1's xid up in the commit log, then writes the answer into both tuple headers as hint bits. the page is dirty again, and because checksums are on, the first change since the checkpoint logs the whole page."
SELECT balance FROM accounts WHERE id = 1;

-- @step T2 "the same read again. the hint bits are already there: no commit log lookup, nothing dirtied, no WAL."
SELECT balance FROM accounts WHERE id = 1;

-- @step T1 "T1 updates bob, then rolls back. the aborted version stays on the page."
BEGIN;
UPDATE accounts SET balance = balance - 10 WHERE id = 2;
ROLLBACK;

-- @step T2 "T2 reads bob. the commit log says aborted, so the new version gets XMIN_INVALID and the old one XMAX_INVALID. no checkpoint since the last full page image, so this time it's a hint with no WAL at all."
SELECT balance FROM accounts WHERE id = 2;
