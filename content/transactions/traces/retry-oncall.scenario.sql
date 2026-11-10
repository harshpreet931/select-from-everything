-- @title on call at serializable, with a retry: the second attempt sees the first one's commit
-- @sessions T1 T2
-- @each xids heap(doctors)

-- @setup
CREATE TABLE doctors (
  name    text PRIMARY KEY,
  on_call boolean NOT NULL
);
INSERT INTO doctors VALUES ('asha', true), ('ben', true);
VACUUM doctors;

-- @step T1 "asha (T1) asks to go off call, at serializable."
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM doctors WHERE on_call;

-- @step T2 "ben (T2) asks at the same moment. he sees 2 on call too."
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM doctors WHERE on_call;

-- @step T1 "T1 takes asha off call."
UPDATE doctors SET on_call = false WHERE name = 'asha';

-- @step T2 "T2 takes ben off call."
UPDATE doctors SET on_call = false WHERE name = 'ben';

-- @step T1 "T1 commits."
COMMIT;

-- @step T2 errors=40001 "T2's commit fails with 40001. the retry loop catches it."
COMMIT;

-- @step T2 "attempt 2: a new transaction, from the top. the check runs again, on a fresh snapshot."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T2 "1 doctor on call. this time the rule says no, so the app doesn't update anything."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T2 "T2 commits an empty transaction and tells ben he has to stay."
COMMIT;

-- @step T1 "asha is off, ben is on. the retry didn't replay the old decision, it made a new one."
SELECT name, on_call FROM doctors ORDER BY name;
