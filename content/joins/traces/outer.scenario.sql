-- @title outer joins in the school: the WHERE that undoes a LEFT JOIN, and the inner join after one
-- @engine pglite
-- @db school
-- @each

-- the clause stepper and the switch on outer-joins read these.

-- @stages T1 "a LEFT JOIN, then a WHERE on the right table"
SELECT i.name, c.code, c.credits
FROM instructors AS i
LEFT JOIN courses AS c ON c.instructor_id = i.id
WHERE c.credits >= 4
ORDER BY i.id, c.code;
-- @stage FROM "the LEFT JOIN keeps all 8 instructors: 11 matched pairs, plus Sofia Petrova, who teaches nothing, padded with NULLs. 12 rows."
SELECT i.name, c.code, c.credits FROM instructors AS i LEFT JOIN courses AS c ON c.instructor_id = i.id ORDER BY i.id, c.code;
-- @stage WHERE "WHERE runs after the join. it drops the 3-credit courses, and Sofia's padded row too: NULL >= 4 is unknown, not true. Yuki Tanaka and Oliver Grant only teach 3-credit courses, so they're gone as well. 5 instructors left: an inner join, in disguise."
SELECT i.name, c.code, c.credits FROM instructors AS i LEFT JOIN courses AS c ON c.instructor_id = i.id WHERE c.credits >= 4 ORDER BY i.id, c.code;
-- @stage ORDER BY
SELECT i.name, c.code, c.credits FROM instructors AS i LEFT JOIN courses AS c ON c.instructor_id = i.id WHERE c.credits >= 4 ORDER BY i.id, c.code;

-- @step T1 "LEFT JOIN, then an inner JOIN: Sofia's padded row has no course code to match an enrollment, so the inner join drops her. 7 instructors."
SELECT i.name, count(e.student_id) AS students
FROM instructors AS i
LEFT JOIN courses AS c ON c.instructor_id = i.id
JOIN enrollments AS e ON e.course_code = c.code
GROUP BY i.id
ORDER BY i.id;

-- @step T1 "LEFT JOIN all the way down: every instructor stays, and Sofia counts 0 students, because count(column) skips NULLs."
SELECT i.name, count(e.student_id) AS students
FROM instructors AS i
LEFT JOIN courses AS c ON c.instructor_id = i.id
LEFT JOIN enrollments AS e ON e.course_code = c.code
GROUP BY i.id
ORDER BY i.id;

-- @step T1 "the JoinLab's left table: five of the 12 courses."
SELECT code, instructor_id FROM courses WHERE code IN ('CS401', 'PHYS101', 'PHYS201', 'HIST101', 'CS499') ORDER BY code;

-- @step T1 "the JoinLab's right table: four of the 8 instructors."
SELECT id, name FROM instructors WHERE id IN (3, 6, 7, 8) ORDER BY id;
