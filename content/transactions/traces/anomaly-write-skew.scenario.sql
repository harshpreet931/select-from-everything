-- @title write skew at all four isolation levels: two doctors each check that someone else is on call, then both go off call
-- @sessions T1 T2
-- @each xids

-- @setup
CREATE TABLE doctors (
  name    text PRIMARY KEY,
  on_call boolean NOT NULL
);
INSERT INTO doctors VALUES ('asha', true), ('ben', true);
VACUUM doctors;

-- @step T1 "read uncommitted. asha (T1) wants to go off call. the rule: at least one doctor stays on."
BEGIN ISOLATION LEVEL READ UNCOMMITTED;

-- @step T1 "T1 counts who's on call: 2. fine to leave."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T2 "ben (T2) wants the same thing, at the same moment."
BEGIN ISOLATION LEVEL READ UNCOMMITTED;

-- @step T2 "T2 counts too: 2. fine to leave."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T1 "T1 takes asha off call. a different row from the one T2 will write."
UPDATE doctors SET on_call = false WHERE name = 'asha';

-- @step T2 "T2 takes ben off call. no row is written twice, so nobody waits."
UPDATE doctors SET on_call = false WHERE name = 'ben';

-- @step T1 "T1 commits."
COMMIT;

-- @step T2 "T2 commits. no error."
COMMIT;

-- @step T1 "0 doctors on call. each decision was right on its own snapshot, and together they broke the rule."
SELECT count(*) FROM doctors WHERE on_call;

-- @step obs "next level. both doctors back on call."
UPDATE doctors SET on_call = true;

-- @step T1 "read committed. asha (T1) wants to go off call. the rule: at least one doctor stays on."
BEGIN ISOLATION LEVEL READ COMMITTED;

-- @step T1 "T1 counts who's on call: 2. fine to leave."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T2 "ben (T2) wants the same thing, at the same moment."
BEGIN ISOLATION LEVEL READ COMMITTED;

-- @step T2 "T2 counts too: 2. fine to leave."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T1 "T1 takes asha off call. a different row from the one T2 will write."
UPDATE doctors SET on_call = false WHERE name = 'asha';

-- @step T2 "T2 takes ben off call. no row is written twice, so nobody waits."
UPDATE doctors SET on_call = false WHERE name = 'ben';

-- @step T1 "T1 commits."
COMMIT;

-- @step T2 "T2 commits. no error."
COMMIT;

-- @step T1 "0 doctors on call. each decision was right on its own snapshot, and together they broke the rule."
SELECT count(*) FROM doctors WHERE on_call;

-- @step obs "next level. both doctors back on call."
UPDATE doctors SET on_call = true;

-- @step T1 "repeatable read. asha (T1) wants to go off call. the rule: at least one doctor stays on."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T1 "T1 counts who's on call: 2. fine to leave."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T2 "ben (T2) wants the same thing, at the same moment."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T2 "T2 counts too: 2. fine to leave."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T1 "T1 takes asha off call. a different row from the one T2 will write."
UPDATE doctors SET on_call = false WHERE name = 'asha';

-- @step T2 "T2 takes ben off call. no row is written twice, so nobody waits."
UPDATE doctors SET on_call = false WHERE name = 'ben';

-- @step T1 "T1 commits."
COMMIT;

-- @step T2 "T2 commits. no error."
COMMIT;

-- @step T1 "0 doctors on call. each decision was right on its own snapshot, and together they broke the rule."
SELECT count(*) FROM doctors WHERE on_call;

-- @step obs "next level. both doctors back on call."
UPDATE doctors SET on_call = true;

-- @step T1 "serializable. asha (T1) wants to go off call. the rule: at least one doctor stays on."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T1 "T1 counts who's on call: 2. fine to leave."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T2 "ben (T2) wants the same thing, at the same moment."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T2 "T2 counts too: 2. fine to leave."
SELECT count(*) FROM doctors WHERE on_call;

-- @step T1 "T1 takes asha off call. a different row from the one T2 will write."
UPDATE doctors SET on_call = false WHERE name = 'asha';

-- @step T2 "T2 takes ben off call. no row is written twice, so nobody waits."
UPDATE doctors SET on_call = false WHERE name = 'ben';

-- @step T1 "T1 commits."
COMMIT;

-- @step T2 errors=40001 "T2 tries to commit. each of them read a row the other one changed, and postgres refuses the second commit: 40001."
COMMIT;

-- @step T1 "1 doctor on call: ben. his transaction never happened."
SELECT count(*) FROM doctors WHERE on_call;

