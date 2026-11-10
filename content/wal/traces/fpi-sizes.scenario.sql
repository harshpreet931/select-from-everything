-- @title WAL bytes for one small UPDATE right after a checkpoint, by wal_compression, and for the same page again
-- @sessions T1
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

-- @step T1 "wal_compression = pglz, first change after a checkpoint."
SET wal_compression = pglz;
CHECKPOINT;
SELECT set_config('my.a', pg_current_wal_insert_lsn()::text, false) IS NOT NULL AS marked;
UPDATE notes SET body = 'changed' WHERE id = 3;
SELECT count(*) AS records, sum(record_length) AS wal_bytes, sum(fpi_length) AS fpi_bytes
FROM pg_get_wal_records_info(current_setting('my.a')::pg_lsn, pg_current_wal_insert_lsn()) WHERE resource_manager LIKE 'Heap%';

-- @step T1 "wal_compression = lz4."
SET wal_compression = lz4;
CHECKPOINT;
SELECT set_config('my.a', pg_current_wal_insert_lsn()::text, false) IS NOT NULL AS marked;
UPDATE notes SET body = 'changed' WHERE id = 4;
SELECT count(*) AS records, sum(record_length) AS wal_bytes, sum(fpi_length) AS fpi_bytes
FROM pg_get_wal_records_info(current_setting('my.a')::pg_lsn, pg_current_wal_insert_lsn()) WHERE resource_manager LIKE 'Heap%';

-- @step T1 "wal_compression = zstd."
SET wal_compression = zstd;
CHECKPOINT;
SELECT set_config('my.a', pg_current_wal_insert_lsn()::text, false) IS NOT NULL AS marked;
UPDATE notes SET body = 'changed' WHERE id = 5;
SELECT count(*) AS records, sum(record_length) AS wal_bytes, sum(fpi_length) AS fpi_bytes
FROM pg_get_wal_records_info(current_setting('my.a')::pg_lsn, pg_current_wal_insert_lsn()) WHERE resource_manager LIKE 'Heap%';
