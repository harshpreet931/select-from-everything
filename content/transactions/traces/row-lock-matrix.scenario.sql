-- @title the four row lock strengths: T1 holds one on each row, T2 asks for every strength with NOWAIT
-- @sessions T1 T2
-- @each

-- @setup
CREATE TABLE t (
  id   int PRIMARY KEY,
  note text NOT NULL
);
INSERT INTO t VALUES (1, 'key share'), (2, 'share'), (3, 'no key update'), (4, 'update');
VACUUM t;

-- @step T1 "T1 opens a transaction."
BEGIN;

-- @step T1 "T1 locks row 1 FOR KEY SHARE, row 2 FOR SHARE, row 3 FOR NO KEY UPDATE and row 4 FOR UPDATE."
SELECT id FROM t WHERE id = 1 FOR KEY SHARE;
SELECT id FROM t WHERE id = 2 FOR SHARE;
SELECT id FROM t WHERE id = 3 FOR NO KEY UPDATE;
SELECT id FROM t WHERE id = 4 FOR UPDATE;

-- @step T2 "row 1 is held FOR KEY SHARE. T2 asks FOR KEY SHARE."
SELECT id FROM t WHERE id = 1 FOR KEY SHARE NOWAIT;

-- @step T2 "row 1, FOR SHARE."
SELECT id FROM t WHERE id = 1 FOR SHARE NOWAIT;

-- @step T2 "row 1, FOR NO KEY UPDATE."
SELECT id FROM t WHERE id = 1 FOR NO KEY UPDATE NOWAIT;

-- @step T2 errors=55P03 "row 1, FOR UPDATE: the one strength KEY SHARE blocks."
SELECT id FROM t WHERE id = 1 FOR UPDATE NOWAIT;

-- @step T2 "row 2 is held FOR SHARE. T2 asks FOR KEY SHARE."
SELECT id FROM t WHERE id = 2 FOR KEY SHARE NOWAIT;

-- @step T2 "row 2, FOR SHARE."
SELECT id FROM t WHERE id = 2 FOR SHARE NOWAIT;

-- @step T2 errors=55P03 "row 2, FOR NO KEY UPDATE."
SELECT id FROM t WHERE id = 2 FOR NO KEY UPDATE NOWAIT;

-- @step T2 errors=55P03 "row 2, FOR UPDATE."
SELECT id FROM t WHERE id = 2 FOR UPDATE NOWAIT;

-- @step T2 "row 3 is held FOR NO KEY UPDATE. T2 asks FOR KEY SHARE."
SELECT id FROM t WHERE id = 3 FOR KEY SHARE NOWAIT;

-- @step T2 errors=55P03 "row 3, FOR SHARE."
SELECT id FROM t WHERE id = 3 FOR SHARE NOWAIT;

-- @step T2 errors=55P03 "row 3, FOR NO KEY UPDATE."
SELECT id FROM t WHERE id = 3 FOR NO KEY UPDATE NOWAIT;

-- @step T2 errors=55P03 "row 3, FOR UPDATE."
SELECT id FROM t WHERE id = 3 FOR UPDATE NOWAIT;

-- @step T2 errors=55P03 "row 4 is held FOR UPDATE. T2 asks FOR KEY SHARE."
SELECT id FROM t WHERE id = 4 FOR KEY SHARE NOWAIT;

-- @step T2 errors=55P03 "row 4, FOR SHARE."
SELECT id FROM t WHERE id = 4 FOR SHARE NOWAIT;

-- @step T2 errors=55P03 "row 4, FOR NO KEY UPDATE."
SELECT id FROM t WHERE id = 4 FOR NO KEY UPDATE NOWAIT;

-- @step T2 errors=55P03 "row 4, FOR UPDATE."
SELECT id FROM t WHERE id = 4 FOR UPDATE NOWAIT;

-- @step T2 "a plain UPDATE of a non-key column on row 1 goes straight through T1's FOR KEY SHARE."
UPDATE t SET note = 'changed' WHERE id = 1;

-- @step T2 blocks "the same UPDATE on row 2 waits for T1's FOR SHARE: a plain UPDATE takes FOR NO KEY UPDATE."
UPDATE t SET note = 'changed' WHERE id = 2;

-- @step T1 "T1 ends its transaction, and T2's update of row 2 goes through."
COMMIT;
