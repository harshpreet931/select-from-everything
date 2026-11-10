-- @title one row updated 1,000 times, each update its own transaction, in three tables: packed, fillfactor 90, and with the updated column indexed
-- @sessions T1
-- @each

-- @setup
CREATE TABLE ff100 (id int PRIMARY KEY, hits int NOT NULL);
CREATE TABLE ff90 (id int PRIMARY KEY, hits int NOT NULL) WITH (fillfactor = 90);
CREATE TABLE idx100 (id int PRIMARY KEY, hits int NOT NULL);
CREATE INDEX idx100_hits ON idx100 (hits);
INSERT INTO ff100 SELECT g, 0 FROM generate_series(1, 226) AS g ORDER BY g;
INSERT INTO ff90 SELECT g, 0 FROM generate_series(1, 226) AS g ORDER BY g;
INSERT INTO idx100 SELECT g, 0 FROM generate_series(1, 226) AS g ORDER BY g;
CREATE PROCEDURE bump(t regclass, n int) LANGUAGE plpgsql AS $$
BEGIN
  FOR i IN 1..n LOOP
    EXECUTE format('UPDATE %s SET hits = hits + 1 WHERE id = 1', t);
    COMMIT;
  END LOOP;
END $$;

-- @step T1 "the three tables as loaded, heap and index sizes in bytes."
SELECT c.relname AS rel, pg_relation_size(c.oid) AS heap_bytes, pg_indexes_size(c.oid) AS index_bytes
FROM pg_class AS c WHERE c.relname IN ('ff100', 'ff90', 'idx100') ORDER BY c.relname;

-- @step T1 "a thousand single-row updates in each, one transaction apiece."
CALL bump('ff100', 1000);
CALL bump('ff90', 1000);
CALL bump('idx100', 1000);

-- @step T1 "how many were HOT, how many had to move the row to another page, and what it did to the sizes."
SELECT pg_stat_force_next_flush();
SELECT s.relname AS rel, s.n_tup_upd AS updates, s.n_tup_hot_upd AS hot, s.n_tup_newpage_upd AS new_page,
       pg_relation_size(s.relid) AS heap_bytes, pg_indexes_size(s.relid) AS index_bytes
FROM pg_stat_user_tables AS s WHERE s.relname IN ('ff100', 'ff90', 'idx100') ORDER BY s.relname;
