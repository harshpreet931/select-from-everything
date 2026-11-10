-- @title literals and their types, the operators postgres can pick from, pg_cast, and five values stored into an int column
-- @engine pglite
-- @each

-- the type stepper, the cast grid and the insert switch on types/types-and-casts read this.

-- @step T1 "the type of each literal on its own, before any operator touches it."
SELECT pg_typeof('1') AS "'1'", pg_typeof(1) AS "1", pg_typeof('1.5') AS "'1.5'";

-- @step T1 "every binary + that takes an integer on the right."
SELECT oprleft::regtype AS left_type, oprright::regtype AS right_type, oprresult::regtype AS result_type
FROM pg_operator
WHERE oprname = '+' AND oprkind = 'b' AND oprright = 'integer'::regtype
ORDER BY oprleft::regtype::text;

-- @step T1 "every || there is."
SELECT oprleft::regtype AS left_type, oprright::regtype AS right_type, oprresult::regtype AS result_type
FROM pg_operator
WHERE oprname = '||'
ORDER BY oprleft::regtype::text, oprright::regtype::text;

-- @step T1 "'1' + 1: the unknown takes integer from the other side."
SELECT '1' + 1 AS result, pg_typeof('1' + 1) AS type;

-- @step T1 errors=22P02 "'1.5' + 1: same operator, so '1.5' has to be read as an integer, and it isn't one."
SELECT '1.5' + 1 AS result;

-- @step T1 "'1' || 1: the unknown becomes text, and text || anynonarray takes the integer."
SELECT '1' || 1 AS result, pg_typeof('1' || 1) AS type;

-- @step T1 errors=42883 "1 || 1: two integers, and no || takes two integers."
SELECT 1 || 1 AS result;

-- @step T1 "the casts between eight common types, and the context each one is allowed in."
SELECT castsource::regtype AS source, casttarget::regtype AS target, castcontext AS context
FROM pg_cast
WHERE castsource = ANY ('{int2,int4,int8,numeric,float8,date,timestamptz,bool}'::regtype[])
  AND casttarget = ANY ('{int2,int4,int8,numeric,float8,date,timestamptz,bool}'::regtype[])
  AND castsource <> casttarget
ORDER BY array_position('{int2,int4,int8,numeric,float8,date,timestamptz,bool}'::regtype[], castsource),
         array_position('{int2,int4,int8,numeric,float8,date,timestamptz,bool}'::regtype[], casttarget);

-- @step T1 "an int column to store into."
CREATE TABLE t (n int);

-- @step T1 "3.7 is a numeric. numeric to integer is an assignment cast, so storing it rounds it."
INSERT INTO t (n) VALUES (3.7) RETURNING n;

-- @step T1 errors=22P02 "'3.7' is an unknown literal, read straight as an integer. no numeric in between, so no rounding: it's just not an integer."
INSERT INTO t (n) VALUES ('3.7') RETURNING n;

-- @step T1 "' 42 ' is an unknown literal too. integer input skips the spaces around it."
INSERT INTO t (n) VALUES (' 42 ') RETURNING n;

-- @step T1 errors=22003 "4000000000 is a bigint. bigint to integer is an assignment cast, and the value doesn't fit."
INSERT INTO t (n) VALUES (4000000000) RETURNING n;

-- @step T1 errors=42804 "true is a boolean. boolean to integer is explicit only, so storing it is refused before anything runs."
INSERT INTO t (n) VALUES (true) RETURNING n;
