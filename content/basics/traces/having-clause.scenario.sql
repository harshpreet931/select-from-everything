-- @title WHERE and HAVING on school's courses, grouped by dept
-- @engine pglite
-- @db school
-- @each

-- GroupBuckets reads these: the same GROUP BY dept with no filter, a WHERE, a HAVING, and both.
-- the WHERE stage is the rows WHERE keeps. the HAVING stage is the rows of the buckets that
-- survive, found with a window count over the same buckets, so the figure can strike the
-- others whole.

-- @stages T1 "no filter"
SELECT dept, count(*) AS courses, sum(credits) AS total
FROM courses
GROUP BY dept
ORDER BY dept;
-- @stage FROM
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY code;
-- @stage GROUP BY
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY dept, code;
-- @stage SELECT
SELECT dept, count(*) AS courses, sum(credits) AS total FROM courses GROUP BY dept ORDER BY dept;

-- @stages T1 "WHERE credits >= 4"
SELECT dept, count(*) AS courses, sum(credits) AS total
FROM courses
WHERE credits >= 4
GROUP BY dept
ORDER BY dept;
-- @stage FROM
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY code;
-- @stage WHERE
SELECT code, dept, credits, instructor_id, title FROM courses WHERE credits >= 4 ORDER BY code;
-- @stage GROUP BY
SELECT code, dept, credits, instructor_id, title FROM courses WHERE credits >= 4 ORDER BY dept, code;
-- @stage SELECT
SELECT dept, count(*) AS courses, sum(credits) AS total FROM courses WHERE credits >= 4 GROUP BY dept ORDER BY dept;

-- @stages T1 "HAVING count(*) >= 2"
SELECT dept, count(*) AS courses, sum(credits) AS total
FROM courses
GROUP BY dept
HAVING count(*) >= 2
ORDER BY dept;
-- @stage FROM
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY code;
-- @stage GROUP BY
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY dept, code;
-- @stage HAVING
SELECT code, dept, credits, instructor_id, title FROM (SELECT c.*, count(*) OVER (PARTITION BY dept) AS n FROM courses AS c) AS b WHERE n >= 2 ORDER BY dept, code;
-- @stage SELECT
SELECT dept, count(*) AS courses, sum(credits) AS total FROM courses GROUP BY dept HAVING count(*) >= 2 ORDER BY dept;

-- @stages T1 "both"
SELECT dept, count(*) AS courses, sum(credits) AS total
FROM courses
WHERE credits >= 4
GROUP BY dept
HAVING count(*) >= 2
ORDER BY dept;
-- @stage FROM
SELECT code, dept, credits, instructor_id, title FROM courses ORDER BY code;
-- @stage WHERE
SELECT code, dept, credits, instructor_id, title FROM courses WHERE credits >= 4 ORDER BY code;
-- @stage GROUP BY
SELECT code, dept, credits, instructor_id, title FROM courses WHERE credits >= 4 ORDER BY dept, code;
-- @stage HAVING
SELECT code, dept, credits, instructor_id, title FROM (SELECT c.*, count(*) OVER (PARTITION BY dept) AS n FROM courses AS c WHERE credits >= 4) AS b WHERE n >= 2 ORDER BY dept, code;
-- @stage SELECT
SELECT dept, count(*) AS courses, sum(credits) AS total FROM courses WHERE credits >= 4 GROUP BY dept HAVING count(*) >= 2 ORDER BY dept;
