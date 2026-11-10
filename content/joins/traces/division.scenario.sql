-- @title semi joins, anti joins and relational division in the school
-- @engine pglite
-- @db school
-- @each

-- the JoinLab's tables, the division grid and the division switch on exists-semi-anti read these.

-- @step T1 "the JoinLab's left table: four instructors."
SELECT id, name FROM instructors WHERE id IN (3, 6, 7, 8) ORDER BY id;

-- @step T1 "the JoinLab's right table: the courses those four teach, and CS499, which nobody does."
SELECT instructor_id, code FROM courses WHERE code IN ('CS401', 'PHYS101', 'PHYS201', 'HIST101', 'CS499') ORDER BY code;

-- @step T1 "the ten students who took three CS courses or more."
SELECT id, name FROM students WHERE id IN (5, 7, 9, 18, 22, 27, 29, 31, 34, 36) ORDER BY id;

-- @step T1 "the divisor: every course whose dept is CS. CS499 is dept GEN, so it isn't one."
SELECT code FROM courses WHERE dept = 'CS' ORDER BY code;

-- @step T1 "who took which CS course. a full row is a student who took all five: only Priya Nair."
SELECT s.id, s.name, e.course_code
FROM students AS s
JOIN enrollments AS e ON e.student_id = s.id
JOIN courses AS c ON c.code = e.course_code
WHERE c.dept = 'CS' AND s.id IN (5, 7, 9, 18, 22, 27, 29, 31, 34, 36)
ORDER BY s.id, e.course_code;

-- @step T1 "double NOT EXISTS: students for whom there is no CS course they didn't take. Priya Nair, alone."
SELECT s.id, s.name
FROM students AS s
WHERE NOT EXISTS (
  SELECT 1 FROM courses AS c
  WHERE c.dept = 'CS'
    AND NOT EXISTS (
      SELECT 1 FROM enrollments AS e
      WHERE e.student_id = s.id AND e.course_code = c.code))
ORDER BY s.id;

-- @step T1 "counting: students whose distinct CS courses number as many as there are CS courses. Priya again."
SELECT s.id, s.name
FROM students AS s
JOIN enrollments AS e ON e.student_id = s.id
JOIN courses AS c ON c.code = e.course_code
WHERE c.dept = 'CS'
GROUP BY s.id
HAVING count(DISTINCT c.code) = (SELECT count(*) FROM courses WHERE dept = 'CS')
ORDER BY s.id;

-- @step T1 "divide by every course whose code starts with CS, and CS499 comes along. nobody has taken it, so nobody took them all."
SELECT s.id, s.name
FROM students AS s
WHERE NOT EXISTS (
  SELECT 1 FROM courses AS c
  WHERE c.code LIKE 'CS%'
    AND NOT EXISTS (
      SELECT 1 FROM enrollments AS e
      WHERE e.student_id = s.id AND e.course_code = c.code))
ORDER BY s.id;

-- @step T1 "the counting version agrees: six courses to match, and nobody has six."
SELECT s.id, s.name
FROM students AS s
JOIN enrollments AS e ON e.student_id = s.id
JOIN courses AS c ON c.code = e.course_code
WHERE c.code LIKE 'CS%'
GROUP BY s.id
HAVING count(DISTINCT c.code) = (SELECT count(*) FROM courses WHERE code LIKE 'CS%')
ORDER BY s.id;

-- @step T1 "divide by the LAW courses, of which there are none. no LAW course is missing for anyone, so all 40 students qualify, Sam Rivera with no enrollments at all included."
SELECT s.id, s.name
FROM students AS s
WHERE NOT EXISTS (
  SELECT 1 FROM courses AS c
  WHERE c.dept = 'LAW'
    AND NOT EXISTS (
      SELECT 1 FROM enrollments AS e
      WHERE e.student_id = s.id AND e.course_code = c.code))
ORDER BY s.id;

-- @step T1 "the counting version disagrees: with no LAW courses there are no rows to group, so nobody comes out."
SELECT s.id, s.name
FROM students AS s
JOIN enrollments AS e ON e.student_id = s.id
JOIN courses AS c ON c.code = e.course_code
WHERE c.dept = 'LAW'
GROUP BY s.id
HAVING count(DISTINCT c.code) = (SELECT count(*) FROM courses WHERE dept = 'LAW')
ORDER BY s.id;
