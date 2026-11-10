-- @title NOT IN against a list with one NULL in it: instructors who teach nothing
-- @engine pglite
-- @db school
-- @each

-- the NOT IN figure reads these: the instructors, the list the subquery returns (CS499 brings
-- the NULL), every instructor <> every value, and each instructor's verdict under three forms
-- of the query. then the two plans.

-- @step T1 "the instructors."
SELECT id, name FROM instructors ORDER BY id;

-- @step T1 "the subquery's rows: every course's instructor_id. CS499 has none."
SELECT code, instructor_id FROM courses ORDER BY instructor_id NULLS LAST, code;

-- @step T1 "every instructor against every value in the list, compared with <>."
SELECT i.id, c.code, c.instructor_id, i.id <> c.instructor_id AS ne
FROM instructors AS i CROSS JOIN courses AS c
ORDER BY i.id, c.code;

-- @step T1 "each instructor's verdict: NOT IN with the NULL, NOT IN without it, NOT EXISTS."
SELECT i.id, i.name,
       i.id NOT IN (SELECT instructor_id FROM courses) AS not_in,
       i.id NOT IN (SELECT instructor_id FROM courses WHERE instructor_id IS NOT NULL) AS not_in_no_nulls,
       NOT EXISTS (SELECT 1 FROM courses AS c WHERE c.instructor_id = i.id) AS not_exists
FROM instructors AS i
ORDER BY i.id;

-- @explain T1 "NOT IN: a filter with a hashed SubPlan. it can't become an anti join."
SELECT i.name FROM instructors AS i
WHERE i.id NOT IN (SELECT instructor_id FROM courses);

-- @explain T1 "NOT EXISTS: an anti join."
SELECT i.name FROM instructors AS i
WHERE NOT EXISTS (SELECT 1 FROM courses AS c WHERE c.instructor_id = i.id);
