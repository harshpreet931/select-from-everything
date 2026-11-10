-- @title row_number, rank and dense_rank over the school's grade point averages
-- @engine pglite
-- @db school
-- @each

-- the tie ladder and the top-4 switch on ranking read this file. gpa is a view: each student's
-- graded courses, A = 4 down to F = 0, averaged.

-- @setup
CREATE VIEW gpa AS
SELECT s.id, s.name,
       round(avg(CASE e.grade WHEN 'A' THEN 4 WHEN 'B' THEN 3 WHEN 'C' THEN 2 WHEN 'D' THEN 1 ELSE 0 END), 2) AS gpa
FROM students AS s
JOIN enrollments AS e ON e.student_id = s.id
WHERE e.grade IS NOT NULL
GROUP BY s.id;

-- @step T1 "the top 15 by gpa, numbered three ways. row_number breaks ties by id, because it was told to."
SELECT id, name, gpa,
       row_number() OVER (ORDER BY gpa DESC, id) AS row_number,
       rank()       OVER (ORDER BY gpa DESC)     AS rank,
       dense_rank() OVER (ORDER BY gpa DESC)     AS dense_rank
FROM gpa
ORDER BY gpa DESC, id
LIMIT 15;

-- @step T1 "row_number: exactly four rows, because every number is used once. Mateo Garcia gets fourth place and Mateus Lima, on the same gpa, doesn't, only because 27 < 38."
SELECT id, name, gpa, n
FROM (SELECT *, row_number() OVER (ORDER BY gpa DESC, id) AS n FROM gpa) AS t
WHERE n <= 4
ORDER BY n, id;

-- @step T1 "rank: both students on 3.50 share rank 4, so the top four is five people."
SELECT id, name, gpa, n
FROM (SELECT *, rank() OVER (ORDER BY gpa DESC) AS n FROM gpa) AS t
WHERE n <= 4
ORDER BY n, id;

-- @step T1 "dense_rank: rank 4 is the fourth different gpa, 3.00, and nine people have it. fifteen rows."
SELECT id, name, gpa, n
FROM (SELECT *, dense_rank() OVER (ORDER BY gpa DESC) AS n FROM gpa) AS t
WHERE n <= 4
ORDER BY n, id;

-- @step T1 "row_number() OVER (ORDER BY gpa DESC), no tiebreaker, rows read from the view: Mateus Lima (38) comes out 4th, ahead of Mateo Garcia (27)."
SELECT id, name, gpa, row_number() OVER (ORDER BY gpa DESC) AS n
FROM gpa
ORDER BY gpa DESC, id
LIMIT 6;

-- @step T1 "the same window over the same rows, handed over in reverse id order: now Nora Jensen is 1st among the three on 4.00. nothing in the query said who goes first among equals."
SELECT id, name, gpa, row_number() OVER (ORDER BY gpa DESC) AS n
FROM (SELECT * FROM gpa ORDER BY id DESC) AS g
ORDER BY gpa DESC, id
LIMIT 6;

-- @step T1 "with id as the tiebreaker, the order among equals is written down, and both inputs give these numbers."
SELECT id, name, gpa, row_number() OVER (ORDER BY gpa DESC, id) AS n
FROM (SELECT * FROM gpa ORDER BY id DESC) AS g
ORDER BY gpa DESC, id
LIMIT 6;
