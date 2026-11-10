-- @title a buffer pin: an open cursor keeps a page pinned, and VACUUM has to work around it
-- @sessions T1 T2
-- @server log_min_messages=info
-- @each

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;
UPDATE accounts SET balance = 90.00 WHERE id = 2;

-- @step T1 +buffers "T1 opens a cursor over accounts and fetches one row. the scan stops there, holding a pin on page 0 until the cursor moves on or closes."
BEGIN;
DECLARE c CURSOR FOR SELECT id, owner FROM accounts;
FETCH 1 FROM c;

-- @step obs "pg_buffercache counts the pin: one backend is pinning the table's page 0."
SELECT relblocknumber AS block, pinning_backends
FROM pg_buffercache
WHERE relfilenode = pg_relation_filenode('accounts')
  AND relforknumber = 0
  AND reldatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY relblocknumber;

-- @step T2 "a pin doesn't stop writers. T2 updates alice on the pinned page: it only needs the page's content lock, for a moment."
UPDATE accounts SET balance = 110.00 WHERE id = 1;

-- @step obs +log "VACUUM needs more than a content lock to remove dead tuples: a cleanup lock, which means nobody else has the page pinned. it can't get one, so it leaves the dead version of bob where it is."
VACUUM (VERBOSE, PROCESS_TOAST false) accounts;

-- @step T1 "T1 closes the cursor and ends. the pin is gone."
COMMIT;

-- @step obs +log "a second VACUUM gets its cleanup lock and removes the dead versions."
VACUUM (VERBOSE, PROCESS_TOAST false) accounts;
