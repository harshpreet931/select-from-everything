-- @title false positives: two serializable transactions that touch different rows, without an index, with one, and with one on full pages
-- @sessions T1 T2
-- @each locks

-- @setup
CREATE TABLE plain (id int NOT NULL, v int NOT NULL);
INSERT INTO plain SELECT g, 0 FROM generate_series(1, 1000) AS g;
CREATE TABLE keyed (id int PRIMARY KEY, v int NOT NULL) WITH (fillfactor = 50);
INSERT INTO keyed SELECT g, 0 FROM generate_series(1, 1000) AS g;
VACUUM ANALYZE plain;
VACUUM ANALYZE keyed;

-- @step T1 "round one: plain has no index. T1 reads row 1. with no index, that's a seq scan, and the SIRead lock covers the whole relation."
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT v FROM plain WHERE id = 1;

-- @step T2 "T2 reads row 2, also a seq scan: another relation-wide note."
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT v FROM plain WHERE id = 2;

-- @step T1 "T1 writes row 1. T2's note covers the whole table, so this counts as T2 → T1."
UPDATE plain SET v = v + 1 WHERE id = 1;

-- @step T2 "T2 writes row 2: T1 → T2. on paper, a cycle, though the two never touched the same row."
UPDATE plain SET v = v + 1 WHERE id = 2;

-- @step T1 "T1 commits fine."
COMMIT;

-- @step T2 errors=40001 "T2's commit fails with 40001. a false positive: running T1 then T2 one at a time would have given exactly this result."
COMMIT;

-- @step obs "round two: the same thing on keyed, which has a primary key."
SELECT 'round two' AS round;

-- @step T1 "T1 reads row 1 through the index. now the notes are small: one tuple, one index page."
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT v FROM keyed WHERE id = 1;

-- @step T2 "T2 reads row 2 the same way."
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT v FROM keyed WHERE id = 2;

-- @step T1 "T1 writes row 1. nobody else's note covers it."
UPDATE keyed SET v = v + 1 WHERE id = 1;

-- @step T2 "T2 writes row 2. no edge either way."
UPDATE keyed SET v = v + 1 WHERE id = 2;

-- @step T1 "T1 commits."
COMMIT;

-- @step T2 "and so does T2. no false positive this time."
COMMIT;

-- @step obs "round three: the same table, but packed full (fillfactor 100), so an update can't stay on its page."
CREATE TABLE packed (id int PRIMARY KEY, v int NOT NULL);
INSERT INTO packed SELECT g, 0 FROM generate_series(1, 1000) AS g;
VACUUM ANALYZE packed;

-- @step T1 "T1 reads row 1 through the index: one tuple, one index leaf page."
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT v FROM packed WHERE id = 1;

-- @step T2 "T2 reads row 2: another tuple, and the same leaf page, because keys 1 and 2 sit side by side."
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT v FROM packed WHERE id = 2;

-- @step T1 "T1 writes row 1. the page is full, so the new version goes to another page and needs a new index entry, on the leaf page T2 has a note on: T2 → T1."
UPDATE packed SET v = v + 1 WHERE id = 1;

-- @step T2 "T2 writes row 2, with a new index entry on the page T1 read: T1 → T2."
UPDATE packed SET v = v + 1 WHERE id = 2;

-- @step T1 "T1 commits."
COMMIT;

-- @step T2 errors=40001 "T2 fails again: the notes were per page, and the page was shared."
COMMIT;
