-- @title what one INSERT writes with three indexes, and the WAL of 10,000 inserts with 0 to 6 indexes
-- @engine pglite
-- @each

-- index-costs reads this file. people has a primary key and two more indexes. measure() builds a
-- fresh table with k indexes and records the WAL that 10,000 inserts produce (the difference of
-- pg_current_wal_insert_lsn around the INSERT).

-- @setup
CREATE TABLE people (id int PRIMARY KEY, email text NOT NULL, city text NOT NULL);
CREATE INDEX people_email ON people (email);
CREATE INDEX people_city ON people (city);
INSERT INTO people VALUES (1, 'maya.chen@example.com', 'San Francisco');
CREATE TABLE wal_cost (indexes int, wal_bytes bigint, heap_bytes bigint, index_bytes bigint);
CREATE PROCEDURE measure(k int) LANGUAGE plpgsql AS $$
DECLARE l0 pg_lsn; l1 pg_lsn;
BEGIN
  DROP TABLE IF EXISTS t;
  CREATE TABLE t (id int, a int, b int, c int, d int, e int);
  FOR i IN 1..k LOOP
    EXECUTE format('CREATE INDEX ON t (%s)', (ARRAY['id', 'a', 'b', 'c', 'd', 'e'])[i]);
  END LOOP;
  COMMIT;
  l0 := pg_current_wal_insert_lsn();
  INSERT INTO t SELECT g, g % 97, g % 89, g % 83, g % 79, g % 73 FROM generate_series(1, 10000) AS g ORDER BY g;
  COMMIT;
  l1 := pg_current_wal_insert_lsn();
  INSERT INTO wal_cost VALUES (k, pg_wal_lsn_diff(l1, l0), pg_relation_size('t'), pg_indexes_size('t'));
  COMMIT;
END $$;

-- @step T1 "remember where the WAL is, without writing any."
SELECT set_config('my.start', pg_current_wal_insert_lsn()::text, false) IS NOT NULL AS marked;

-- @step T1 "one row."
INSERT INTO people VALUES (42, 'ada@example.com', 'London');

-- @step T1 "the WAL records that one INSERT wrote, with the relation each one changed."
SELECT c.relname AS relation, r.resource_manager || '/' || r.record_type AS record, r.record_length AS bytes
FROM pg_get_wal_records_info(current_setting('my.start')::pg_lsn, pg_current_wal_insert_lsn()) AS r
LEFT JOIN pg_get_wal_block_info(current_setting('my.start')::pg_lsn, pg_current_wal_insert_lsn()) AS b ON b.start_lsn = r.start_lsn
LEFT JOIN pg_class AS c ON c.relfilenode = b.relfilenode
ORDER BY r.start_lsn;

-- @step T1 "10,000 inserts into the same six-column table with 0, 1, 2, 3, 4, 5 and 6 indexes."
CALL measure(0);
CALL measure(1);
CALL measure(2);
CALL measure(3);
CALL measure(4);
CALL measure(5);
CALL measure(6);
SELECT indexes, wal_bytes, heap_bytes, index_bytes FROM wal_cost ORDER BY indexes;
