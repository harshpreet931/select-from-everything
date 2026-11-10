-- @title one join, four spellings: ON, ON a different column, USING and NATURAL
-- @engine pglite
-- @db school
-- @each

-- the switch on inner-join reads these. every run is narrowed to the course CS301 so the rows
-- fit, and keeps SELECT * so the columns show what each spelling does to them.

-- @step T1 "ON names the pair of columns: the course's instructor_id against the instructor's id. one teacher, and every column of both tables, so dept appears twice."
SELECT *
FROM courses AS c
JOIN instructors AS i ON i.id = c.instructor_id
WHERE c.code = 'CS301';

-- @step T1 "a different ON, a different question: instructors from the same department as the course. four CS instructors, four rows."
SELECT *
FROM courses AS c
JOIN instructors AS i ON i.dept = c.dept
WHERE c.code = 'CS301'
ORDER BY i.id;

-- @step T1 "USING (dept) is the same join, written as the shared column's name. dept comes out once, first."
SELECT *
FROM courses
JOIN instructors USING (dept)
WHERE code = 'CS301'
ORDER BY id;

-- @step T1 "NATURAL JOIN joins on every column name the two tables share. here that's only dept, so it quietly means USING (dept), not \"who teaches it\"."
SELECT *
FROM courses
NATURAL JOIN instructors
WHERE code = 'CS301'
ORDER BY id;
