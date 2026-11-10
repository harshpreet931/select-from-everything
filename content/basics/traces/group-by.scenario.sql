-- @title GROUP BY on school's 12 courses, one capture per grouping key
-- @engine pglite
-- @db school
-- @each

-- GroupBuckets reads these. each @stages step is one choice of key: FROM is the table, GROUP BY
-- is the same rows sorted by the key (NULLs first), so a bucket is a run of equal keys, and
-- SELECT is the real result, keys first. after each one, the same query with title added to
-- SELECT, which postgres refuses.

-- @stages T1 "no GROUP BY at all"
SELECT count(*) AS courses, sum(credits) AS total
FROM courses;
-- @stage FROM
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY code;
-- @stage GROUP BY "there is no GROUP BY, but SELECT has aggregates, so the whole table is one bucket."
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY code;
-- @stage SELECT
SELECT count(*) AS courses, sum(credits) AS total FROM courses;

-- @step T1 errors=42803 "no GROUP BY at all, with title in SELECT"
SELECT title, count(*) AS courses
FROM courses;

-- @stages T1 "GROUP BY dept"
SELECT dept, count(*) AS courses, sum(credits) AS total
FROM courses
GROUP BY dept
ORDER BY dept;
-- @stage FROM
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY code;
-- @stage GROUP BY
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY dept NULLS FIRST, code;
-- @stage SELECT
SELECT dept, count(*) AS courses, sum(credits) AS total FROM courses GROUP BY dept ORDER BY dept NULLS FIRST;

-- @step T1 errors=42803 "GROUP BY dept, with title in SELECT"
SELECT dept, title, count(*) AS courses
FROM courses
GROUP BY dept;

-- @stages T1 "GROUP BY credits"
SELECT credits, count(*) AS courses, sum(credits) AS total
FROM courses
GROUP BY credits
ORDER BY credits;
-- @stage FROM
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY code;
-- @stage GROUP BY
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY credits NULLS FIRST, code;
-- @stage SELECT
SELECT credits, count(*) AS courses, sum(credits) AS total FROM courses GROUP BY credits ORDER BY credits NULLS FIRST;

-- @step T1 errors=42803 "GROUP BY credits, with title in SELECT"
SELECT credits, title, count(*) AS courses
FROM courses
GROUP BY credits;

-- @stages T1 "GROUP BY dept, credits"
SELECT dept, credits, count(*) AS courses, sum(credits) AS total
FROM courses
GROUP BY dept, credits
ORDER BY dept, credits;
-- @stage FROM
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY code;
-- @stage GROUP BY
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY dept NULLS FIRST, credits NULLS FIRST, code;
-- @stage SELECT
SELECT dept, credits, count(*) AS courses, sum(credits) AS total FROM courses GROUP BY dept, credits ORDER BY dept NULLS FIRST, credits NULLS FIRST;

-- @step T1 errors=42803 "GROUP BY dept, credits, with title in SELECT"
SELECT dept, credits, title, count(*) AS courses
FROM courses
GROUP BY dept, credits;

-- @stages T1 "GROUP BY instructor_id"
SELECT instructor_id, count(*) AS courses, sum(credits) AS total
FROM courses
GROUP BY instructor_id
ORDER BY instructor_id;
-- @stage FROM
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY code;
-- @stage GROUP BY
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY instructor_id NULLS FIRST, code;
-- @stage SELECT
SELECT instructor_id, count(*) AS courses, sum(credits) AS total FROM courses GROUP BY instructor_id ORDER BY instructor_id NULLS FIRST;

-- @step T1 errors=42803 "GROUP BY instructor_id, with title in SELECT"
SELECT instructor_id, title, count(*) AS courses
FROM courses
GROUP BY instructor_id;
