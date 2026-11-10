-- @title one table, one row per case of the visibility rules, and a repeatable read reader R that reads them all
-- @sessions T1 T2 T3 R
-- @each xids heap(cases)

-- @setup
CREATE TABLE cases (id int NOT NULL, what text NOT NULL);
INSERT INTO cases VALUES
  (1, 'plain old row'),
  (2, 'deleted, committed'),
  (3, 'deleted, still running'),
  (4, 'deleted, rolled back'),
  (8, 'locked, not deleted'),
  (9, 'deleted by R itself');

-- @step T1 "T1 deletes row 2 and commits, before anyone else starts."
BEGIN;
DELETE FROM cases WHERE id = 2;
COMMIT;

-- @step T2 "T2 deletes row 4 and inserts row 5, then rolls both back."
BEGIN;
DELETE FROM cases WHERE id = 4;
INSERT INTO cases VALUES (5, 'inserted, rolled back');
ROLLBACK;

-- @step T3 "T3 deletes row 3 and inserts row 6, and stays open."
BEGIN;
DELETE FROM cases WHERE id = 3;
INSERT INTO cases VALUES (6, 'inserted, still running');

-- @step T2 "T2 locks row 8 with FOR UPDATE, and stays open. a lock goes into xmax too."
BEGIN;
SELECT id FROM cases WHERE id = 8 FOR UPDATE;

-- @step T1 "T1 inserts row 11 and commits. it got its xid after T3 and T2 got theirs, but it finished first."
INSERT INTO cases VALUES (11, 'inserted, committed');

-- @step R "R starts at repeatable read. its first query takes the snapshot: T3 and T2 are still running."
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) FROM cases;

-- @step T1 "T1 inserts row 7 and commits. it started after R's snapshot was taken."
INSERT INTO cases VALUES (7, 'inserted after the snapshot');

-- @step R "R writes too: it deletes row 9 and inserts row 10. now R has an xid of its own."
DELETE FROM cases WHERE id = 9;
INSERT INTO cases VALUES (10, 'inserted by R itself');

-- @step R +rows(cases) "R reads the whole table. these are the rows postgres decided R can see. the rows probe is a brand new transaction reading the same page."
SELECT ctid, id, what FROM cases ORDER BY ctid;
