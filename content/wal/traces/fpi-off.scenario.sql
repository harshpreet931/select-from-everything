-- @title the same UPDATEs with full_page_writes off: no page image after the checkpoint
-- @sessions T1
-- @server full_page_writes=off
-- @each

-- @setup
CREATE TABLE notes (id int, body text NOT NULL);
INSERT INTO notes SELECT g, 'note ' || g || ': ' || repeat('.', 40) FROM generate_series(1, 60) AS g;

-- @step T1 "wal_compression off (the default), the first change to the page since a checkpoint."
CHECKPOINT;
SELECT set_config('my.a', pg_current_wal_insert_lsn()::text, false) IS NOT NULL AS marked;
UPDATE notes SET body = 'changed' WHERE id = 1;
SELECT count(*) AS records, sum(record_length) AS wal_bytes, sum(fpi_length) AS fpi_bytes
FROM pg_get_wal_records_info(current_setting('my.a')::pg_lsn, pg_current_wal_insert_lsn()) WHERE resource_manager LIKE 'Heap%';

-- @step T1 "the same page again, no checkpoint in between."
SELECT set_config('my.a', pg_current_wal_insert_lsn()::text, false) IS NOT NULL AS marked;
UPDATE notes SET body = 'changed' WHERE id = 2;
SELECT count(*) AS records, sum(record_length) AS wal_bytes, sum(fpi_length) AS fpi_bytes
FROM pg_get_wal_records_info(current_setting('my.a')::pg_lsn, pg_current_wal_insert_lsn()) WHERE resource_manager LIKE 'Heap%';

