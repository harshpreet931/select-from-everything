-- @title does X determine Y? four candidate dependencies, checked on the school data
-- @engine pglite
-- @db school
-- @each

-- functional-dependencies reads these for its RunPick. each query lists every distinct (X, Y)
-- pair with its row count, and postgres's own verdict: true when that X has only one Y.

-- @step T1 "every course code has one title in these 30 rows. it's a rule, too: courses are keyed by code."
SELECT course_code, course_title, count(*) AS rows,
       count(*) OVER (PARTITION BY course_code) = 1 AS agrees
FROM enrollments_flat GROUP BY course_code, course_title ORDER BY course_code, course_title;

-- @step T1 "Hannah Okoye has two offices. the 30 rows contradict instructor_name → instructor_office, and one counterexample is enough."
SELECT instructor_name, instructor_office, count(*) AS rows,
       count(*) OVER (PARTITION BY instructor_name) = 1 AS agrees
FROM enrollments_flat GROUP BY instructor_name, instructor_office ORDER BY instructor_name, instructor_office;

-- @step T1 "in these 30 rows every student name has one email. that's luck, not a rule."
SELECT student_name, student_email, count(*) AS rows,
       count(*) OVER (PARTITION BY student_name) = 1 AS agrees
FROM enrollments_flat GROUP BY student_name, student_email ORDER BY student_name, student_email;

-- @step T1 "all 40 students: there are two Alex Kims, with two emails. a name never determined an email; the sample just hadn't met both."
SELECT name, email, count(*) AS rows,
       count(*) OVER (PARTITION BY name) = 1 AS agrees
FROM students GROUP BY name, email ORDER BY count(*) OVER (PARTITION BY name) DESC, name, email;
