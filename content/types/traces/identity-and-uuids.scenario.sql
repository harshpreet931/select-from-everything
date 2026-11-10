-- @title an identity column's sequence pushed off course and put back, two uuids taken apart, and where 1,000 inserts land in three b-trees
-- @engine pglite
-- @ext pageinspect
-- @each

-- the sequence stepper, the uuid anatomy and the locality bars on types/identity-and-uuids read this.

-- @step T1 "an identity column, two rows. the sequence behind it has handed out 1 and 2."
CREATE TABLE teas (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL);
INSERT INTO teas (name) VALUES ('assam'), ('sencha');
SELECT id, name, (SELECT last_value FROM teas_id_seq) AS seq_last_value FROM teas ORDER BY id;

-- @step T1 "OVERRIDING SYSTEM VALUE puts an id in by hand. the sequence doesn't hear about it."
INSERT INTO teas (id, name) OVERRIDING SYSTEM VALUE VALUES (3, 'oolong');
SELECT id, name, (SELECT last_value FROM teas_id_seq) AS seq_last_value FROM teas ORDER BY id;

-- @step T1 errors=23505 "the next ordinary insert takes 3 from the sequence, and 3 is taken."
INSERT INTO teas (name) VALUES ('rooibos');

-- @step T1 "setval moves the sequence to the highest id in the table. (the failed insert used up 3 already.)"
SELECT setval(pg_get_serial_sequence('teas', 'id'), (SELECT max(id) FROM teas));
SELECT id, name, (SELECT last_value FROM teas_id_seq) AS seq_last_value FROM teas ORDER BY id;

-- @step T1 "and inserts work again, from 4."
INSERT INTO teas (name) VALUES ('rooibos');
SELECT id, name, (SELECT last_value FROM teas_id_seq) AS seq_last_value FROM teas ORDER BY id;

-- @step T1 "two uuids taken apart: the version postgres reads from each, and the timestamp a version 7 carries in its first 48 bits."
SET TimeZone = 'UTC';
SELECT u AS uuid, uuid_extract_version(u) AS version, uuid_extract_timestamp(u) AS embedded_time,
       ('x' || lpad(left(replace(u::text, '-', ''), 12), 16, '0'))::bit(64)::bigint AS first_48_bits
FROM (VALUES (1, '7c9e6679-7425-40de-944b-e07fc1f90ae7'::uuid), (2, '019a2b64-7f20-7b3c-9a1d-4e5f60718293'::uuid)) AS v (n, u)
ORDER BY n;

-- @step T1 "three tables, 20,000 rows each: a random uuid key (md5 of the row number, so the run repeats), uuidv7(), and a bigint identity."
CREATE TABLE r (id uuid PRIMARY KEY, n int);
CREATE TABLE t (id uuid PRIMARY KEY, n int);
CREATE TABLE g (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, n int);
INSERT INTO r SELECT md5(i::text)::uuid, i FROM generate_series(1, 20000) AS i;
INSERT INTO t SELECT uuidv7(), i FROM generate_series(1, 20000) AS i;
INSERT INTO g (n) SELECT i FROM generate_series(1, 20000) AS i;

-- @step T1 "each primary key's leaf pages, and how many of them hold one of the last 1,000 rows inserted."
WITH k (n, key, idx) AS (VALUES (1, 'random uuid', 'r_pkey'), (2, 'uuidv7', 't_pkey'), (3, 'bigint', 'g_pkey')),
leaves AS (
  SELECT k.n, b AS blkno
  FROM k, generate_series(1, (pg_relation_size(k.idx::regclass) / 8192 - 1)::int) AS b
  WHERE (bt_page_stats(k.idx, b)).type = 'l'
),
touched AS (
  SELECT 1 AS n, count(DISTINCT l.blkno) AS c FROM leaves l, bt_page_items('r_pkey', l.blkno) i JOIN r ON r.ctid = i.htid WHERE l.n = 1 AND r.n > 19000
  UNION ALL
  SELECT 2, count(DISTINCT l.blkno) FROM leaves l, bt_page_items('t_pkey', l.blkno) i JOIN t ON t.ctid = i.htid WHERE l.n = 2 AND t.n > 19000
  UNION ALL
  SELECT 3, count(DISTINCT l.blkno) FROM leaves l, bt_page_items('g_pkey', l.blkno) i JOIN g ON g.ctid = i.htid WHERE l.n = 3 AND g.n > 19000
)
SELECT k.key, (SELECT count(*) FROM leaves l WHERE l.n = k.n) AS leaf_pages, touched.c AS leaves_with_last_1000
FROM k JOIN touched USING (n)
ORDER BY k.n;
