-- @title ORDER BY on school's courses: sort keys, ties, and where the NULL goes
-- @engine pglite
-- @db school
-- @each

-- @step T1 "ORDER BY dept"
SELECT code, dept, credits, title
FROM courses
ORDER BY dept;

-- @step T1 "ORDER BY dept, credits"
SELECT code, dept, credits, title
FROM courses
ORDER BY dept, credits;

-- @step T1 "ORDER BY dept, credits, code"
SELECT code, dept, credits, title
FROM courses
ORDER BY dept, credits, code;

-- @step T1 "ascending, with no NULLS clause: NULL counts as bigger than every value, so the course with no instructor comes last."
SELECT code, instructor_id, title
FROM courses
ORDER BY instructor_id ASC, code;

-- @step T1 "ascending with NULLS FIRST: the numbers still go up, and the NULL is pinned to the top."
SELECT code, instructor_id, title
FROM courses
ORDER BY instructor_id ASC NULLS FIRST, code;

-- @step T1 "ascending with NULLS LAST: the same as the default, said out loud."
SELECT code, instructor_id, title
FROM courses
ORDER BY instructor_id ASC NULLS LAST, code;

-- @step T1 "descending, with no NULLS clause: the biggest value comes first, and to postgres the biggest is NULL."
SELECT code, instructor_id, title
FROM courses
ORDER BY instructor_id DESC, code;

-- @step T1 "descending with NULLS FIRST: the same as the default, said out loud."
SELECT code, instructor_id, title
FROM courses
ORDER BY instructor_id DESC NULLS FIRST, code;

-- @step T1 "descending with NULLS LAST: the numbers go down, and the NULL waits at the bottom."
SELECT code, instructor_id, title
FROM courses
ORDER BY instructor_id DESC NULLS LAST, code;

-- @step T1 "the five CS courses tie on dept. sorted whole, they come back in code order, by luck."
SELECT code, dept, title
FROM courses
ORDER BY dept;

-- @step T1 "the same ORDER BY with LIMIT 3: postgres keeps only the best 3 as it goes (a top-N heapsort), and the tied CS courses come out in another order."
SELECT code, dept, title
FROM courses
ORDER BY dept
LIMIT 3;
