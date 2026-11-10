-- @title on call, at serializable: asha and ben both check that the other is on call, then both go off call
-- @sessions T1 T2
-- @each xids heap(doctors)

-- @setup
CREATE TABLE doctors (
  name    text PRIMARY KEY,
  on_call boolean NOT NULL
);
INSERT INTO doctors VALUES ('asha', true), ('ben', true);
VACUUM doctors;

-- @step T1 "asha (T1) wants to go off call, at serializable. the rule: at least one doctor stays on call."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T1 "T1 counts the doctors on call: 2. so asha can leave."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T2 "ben (T2) wants to go off call at the same moment, also at serializable."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T2 "T2 counts too: 2. so ben can leave."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T1 "T1 takes asha off call."
UPDATE doctors SET on_call = false WHERE name = 'asha';

-- @step T2 "T2 takes ben off call. a different row, so there's no lock to wait for."
UPDATE doctors SET on_call = false WHERE name = 'ben';

-- @step T1 "T1 commits."
COMMIT;

-- @step T2 errors=40001 "T2 tries to commit. postgres has tracked that each transaction read a row the other one changed, and refuses: 40001."
COMMIT;

-- @step T1 "ben is still on call. his transaction rolled back, and his app gets to try again."
SELECT name, on_call FROM doctors ORDER BY name;
