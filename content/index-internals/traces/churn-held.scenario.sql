-- @title the same update churn, while another session holds an old snapshot
-- @sessions T1 T2
-- @each

-- dedup-and-bottom-up-deletion reads this file. the chapter's run blocks churn ch with nobody
-- else looking, and ch_a stays the same size for six passes. here T2 holds a repeatable read
-- snapshot open from the start, so no old version is removable, and bottom-up deletion can't
-- delete anything: ch_a and ch_pkey split like ch_b does.

-- @setup
CREATE TABLE ch (id int PRIMARY KEY, a int, b int);
CREATE INDEX ch_a ON ch (a);
CREATE INDEX ch_b ON ch (b);
INSERT INTO ch SELECT g, g, 0 FROM generate_series(1, 10000) AS g;

-- @step T2 "T2 opens a repeatable read transaction and reads once, which takes its snapshot. it stays open."
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) FROM ch;

-- @step T1 "pass 1: every row updated once, a tenth at a time. sizes in pages."
UPDATE ch SET b = b + 1 WHERE id % 10 = 0;
UPDATE ch SET b = b + 1 WHERE id % 10 = 1;
UPDATE ch SET b = b + 1 WHERE id % 10 = 2;
UPDATE ch SET b = b + 1 WHERE id % 10 = 3;
UPDATE ch SET b = b + 1 WHERE id % 10 = 4;
UPDATE ch SET b = b + 1 WHERE id % 10 = 5;
UPDATE ch SET b = b + 1 WHERE id % 10 = 6;
UPDATE ch SET b = b + 1 WHERE id % 10 = 7;
UPDATE ch SET b = b + 1 WHERE id % 10 = 8;
UPDATE ch SET b = b + 1 WHERE id % 10 = 9;
SELECT pg_relation_size('ch_pkey') / 8192 AS pkey, pg_relation_size('ch_a') / 8192 AS a, pg_relation_size('ch_b') / 8192 AS b;

-- @step T1 "pass 2: every row updated once, a tenth at a time. sizes in pages."
UPDATE ch SET b = b + 1 WHERE id % 10 = 0;
UPDATE ch SET b = b + 1 WHERE id % 10 = 1;
UPDATE ch SET b = b + 1 WHERE id % 10 = 2;
UPDATE ch SET b = b + 1 WHERE id % 10 = 3;
UPDATE ch SET b = b + 1 WHERE id % 10 = 4;
UPDATE ch SET b = b + 1 WHERE id % 10 = 5;
UPDATE ch SET b = b + 1 WHERE id % 10 = 6;
UPDATE ch SET b = b + 1 WHERE id % 10 = 7;
UPDATE ch SET b = b + 1 WHERE id % 10 = 8;
UPDATE ch SET b = b + 1 WHERE id % 10 = 9;
SELECT pg_relation_size('ch_pkey') / 8192 AS pkey, pg_relation_size('ch_a') / 8192 AS a, pg_relation_size('ch_b') / 8192 AS b;

-- @step T1 "pass 3: every row updated once, a tenth at a time. sizes in pages."
UPDATE ch SET b = b + 1 WHERE id % 10 = 0;
UPDATE ch SET b = b + 1 WHERE id % 10 = 1;
UPDATE ch SET b = b + 1 WHERE id % 10 = 2;
UPDATE ch SET b = b + 1 WHERE id % 10 = 3;
UPDATE ch SET b = b + 1 WHERE id % 10 = 4;
UPDATE ch SET b = b + 1 WHERE id % 10 = 5;
UPDATE ch SET b = b + 1 WHERE id % 10 = 6;
UPDATE ch SET b = b + 1 WHERE id % 10 = 7;
UPDATE ch SET b = b + 1 WHERE id % 10 = 8;
UPDATE ch SET b = b + 1 WHERE id % 10 = 9;
SELECT pg_relation_size('ch_pkey') / 8192 AS pkey, pg_relation_size('ch_a') / 8192 AS a, pg_relation_size('ch_b') / 8192 AS b;

-- @step T1 "pass 4: every row updated once, a tenth at a time. sizes in pages."
UPDATE ch SET b = b + 1 WHERE id % 10 = 0;
UPDATE ch SET b = b + 1 WHERE id % 10 = 1;
UPDATE ch SET b = b + 1 WHERE id % 10 = 2;
UPDATE ch SET b = b + 1 WHERE id % 10 = 3;
UPDATE ch SET b = b + 1 WHERE id % 10 = 4;
UPDATE ch SET b = b + 1 WHERE id % 10 = 5;
UPDATE ch SET b = b + 1 WHERE id % 10 = 6;
UPDATE ch SET b = b + 1 WHERE id % 10 = 7;
UPDATE ch SET b = b + 1 WHERE id % 10 = 8;
UPDATE ch SET b = b + 1 WHERE id % 10 = 9;
SELECT pg_relation_size('ch_pkey') / 8192 AS pkey, pg_relation_size('ch_a') / 8192 AS a, pg_relation_size('ch_b') / 8192 AS b;

-- @step T2 "T2 ends. the versions it was holding become removable."
COMMIT;
