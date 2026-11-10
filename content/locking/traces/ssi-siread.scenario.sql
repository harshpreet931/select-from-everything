-- @title SIRead locks: two serializable doctors, write skew, and what pg_locks shows
-- @sessions T1 T2
-- @each locks

-- @setup
CREATE TABLE doctors (
  id      int PRIMARY KEY,
  name    text NOT NULL,
  on_call boolean NOT NULL
);
INSERT INTO doctors VALUES (1, 'asha', true), (2, 'ben', true);
VACUUM ANALYZE doctors;

-- @step T1 "T1 (asha) opens a serializable transaction."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T1 "T1 counts who's on call. the scan reads the whole table, so postgres notes it as an SIReadLock on the relation. a note, not a lock: it blocks nobody."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T2 "T2 (ben) does the same, and gets the same note."
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM doctors WHERE on_call;

-- @step T1 "T1 takes asha off call. T2's SIRead covers that row, so postgres records an rw-antidependency: T2 read something T1 then wrote. T2 → T1."
UPDATE doctors SET on_call = false WHERE id = 1;

-- @step T2 "T2 takes ben off call. T1's SIRead covers ben's row: T1 → T2. now each points at the other. nothing has failed yet."
UPDATE doctors SET on_call = false WHERE id = 2;

-- @step T1 "T1 commits first. its SIRead lock outlives it: T2 is still running and overlapped with it, so the note has to stay."
COMMIT;

-- @step T2 errors=40001 "T2 tries to commit. the structure is complete and one side has committed, so T2 is the one that fails."
COMMIT;
