-- @title logical decoding with test_decoding: the WAL turned back into row changes
-- @sessions T1
-- @server wal_level=logical
-- @each

-- @setup
CREATE TABLE accounts (id int PRIMARY KEY, owner text NOT NULL, balance numeric(12,2) NOT NULL);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);

-- @step obs "a logical slot with the test_decoding plugin. from here on, the server keeps every change this slot hasn't consumed."
SELECT slot_name, lsn FROM pg_create_logical_replication_slot('cdc', 'test_decoding');

-- @step T1 "a transfer: two updates in one transaction."
BEGIN;
UPDATE accounts SET balance = balance - 25.00 WHERE id = 1;
UPDATE accounts SET balance = balance + 25.00 WHERE id = 2;
COMMIT;

-- @step T1 "a new account, and a closed one."
INSERT INTO accounts VALUES (3, 'carol', 50.00);
DELETE FROM accounts WHERE id = 2;

-- @step obs "reading the slot: every committed change since it was created, in commit order, as rows."
SELECT data FROM pg_logical_slot_get_changes('cdc', NULL, NULL);

-- @step obs "read it again: nothing. get_changes consumed them; the slot's position moved past them."
SELECT count(*) AS changes FROM pg_logical_slot_get_changes('cdc', NULL, NULL);

-- @step T1 "replica identity full: the WAL now carries the whole old row on UPDATE and DELETE, not just the key."
ALTER TABLE accounts REPLICA IDENTITY FULL;
UPDATE accounts SET balance = balance + 1.00 WHERE id = 1;
DELETE FROM accounts WHERE id = 3;

-- @step obs "the same kind of changes, now with old-key showing every column of the row before."
SELECT data FROM pg_logical_slot_get_changes('cdc', NULL, NULL);

-- @step T1 "a rolled-back transaction."
BEGIN;
INSERT INTO accounts VALUES (4, 'dave', 10.00);
ROLLBACK;

-- @step obs "it never shows up: decoding only emits committed transactions."
SELECT count(*) AS changes FROM pg_logical_slot_peek_changes('cdc', NULL, NULL);

-- @step obs "a failover slot (postgres 17+): marked so a standby can keep a synced copy and take over the stream."
SELECT slot_name FROM pg_create_logical_replication_slot('cdc_ha', 'pgoutput', failover => true);
SELECT slot_name, plugin, slot_type, failover FROM pg_replication_slots ORDER BY slot_name;
