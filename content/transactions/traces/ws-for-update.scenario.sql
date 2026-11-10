-- @title on call, at read committed with FOR UPDATE: lock the rows the rule depends on
-- @sessions T1 T2
-- @each xids heap(doctors)

-- @setup
CREATE TABLE doctors (
  name    text PRIMARY KEY,
  on_call boolean NOT NULL
);
INSERT INTO doctors VALUES ('asha', true), ('ben', true);
VACUUM doctors;

-- @step T1 "asha (T1) wants to go off call, at read committed."
BEGIN;

-- @step T1 "T1 reads the doctors on call FOR UPDATE: asha and ben, both locked by T1 now. two rows, so asha can leave."
SELECT name FROM doctors WHERE on_call ORDER BY name FOR UPDATE;

-- @step T2 "ben (T2) wants to go off call too."
BEGIN;

-- @step T2 blocks "T2 runs the same locking read, and waits: T1 holds both rows."
SELECT name FROM doctors WHERE on_call ORDER BY name FOR UPDATE;

-- @step T1 "T1 takes asha off call."
UPDATE doctors SET on_call = false WHERE name = 'asha';

-- @step T1 "T1 commits. T2 wakes up and re-checks each row's latest version: asha is off call now, so she drops out. T2 gets one row: ben."
COMMIT;

-- @step T2 "one doctor on call, and it's ben. the app says no, and T2 rolls back."
ROLLBACK;

-- @step T1 "ben is still on call. the second request waited, then saw the truth."
SELECT name, on_call FROM doctors ORDER BY name;
