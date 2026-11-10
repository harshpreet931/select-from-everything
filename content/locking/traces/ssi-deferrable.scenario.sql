-- @title READ ONLY DEFERRABLE: a report waits for a safe snapshot, then runs with no tracking
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

-- @step T1 "T1 is a serializable read-write transaction: it reads, then writes."
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM doctors WHERE on_call;
UPDATE doctors SET on_call = false WHERE id = 1;

-- @step T2 "T2 is a report: SERIALIZABLE, READ ONLY, DEFERRABLE."
BEGIN ISOLATION LEVEL SERIALIZABLE, READ ONLY, DEFERRABLE;

-- @step T2 blocks "its first query waits. a read-write serializable transaction is still running, so no snapshot taken now is guaranteed safe."
SELECT name, on_call FROM doctors ORDER BY id;

-- @step T1 "T1 commits without any rw-antidependency pointing out of it, so the snapshot T2 took when it asked turns out safe. the query returns what was committed before T1, and T2 holds no SIRead locks at all."
COMMIT;

-- @step T2 "T2 commits. a deferrable read-only transaction can never get 40001."
COMMIT;
