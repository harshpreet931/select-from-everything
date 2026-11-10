-- school data. hand-written rows, plus enrollments picked by a hash of (student, course) so
-- they're the same everywhere.
--   student 13 is Robert'); DROP TABLE students;-- (stored safely: that's the point)
--   students 21 and 33 are both Alex Kim
--   student 40 has no enrollments
--   CS499 has no students and no instructor, and its dept is GEN, not CS
--   instructor 8 teaches nothing
--   Priya Nair (7) took every course whose dept is CS (relational division)
--   grades are NULL for the current term, 2026-fall
--   prerequisites: CS101 → CS201 → CS301 → CS401, and CS301 also needs MATH201 (a diamond)
--   enrollments_flat: Hannah Okoye's office says B-101 in every row but one

CREATE SCHEMA gen;
CREATE FUNCTION gen.pick(i int, salt int, m int) RETURNS int
  LANGUAGE sql IMMUTABLE STRICT
  RETURN ((hashint4(i * 977 + salt)::bigint + 2147483648) % m)::int;

INSERT INTO instructors (id, name, dept, office, salary) VALUES
  (1, 'Hannah Okoye', 'CS', 'B-101', 98000.00),
  (2, 'Marco Rossi', 'CS', 'B-102', 91000.00),
  (3, 'Lena Fischer', 'CS', 'B-103', 87000.00),
  (4, 'Tomás Ortega', 'MATH', 'C-201', 85000.00),
  (5, 'Yuki Tanaka', 'MATH', 'C-202', 83000.00),
  (6, 'Amara Diallo', 'PHYS', 'D-301', 90000.00),
  (7, 'Oliver Grant', 'HIST', 'E-110', 72000.00),
  (8, 'Sofia Petrova', 'CS', 'B-104', 79000.00);

INSERT INTO students (id, name, email, year, advisor_id) VALUES
  (1, 'Maya Chen', 'maya.chen@uni.example', 4, 1),
  (2, 'Liam Walsh', 'liam.walsh@uni.example', 3, 2),
  (3, 'Aisha Bello', 'aisha.bello@uni.example', 2, 4),
  (4, 'Noah Schmidt', 'noah.schmidt@uni.example', 1, 2),
  (5, 'Emma Dubois', 'emma.dubois@uni.example', 4, 6),
  (6, 'Kenji Watanabe', 'kenji.watanabe@uni.example', 3, 3),
  (7, 'Priya Nair', 'priya.nair@uni.example', 4, 1),
  (8, 'Lucas Costa', 'lucas.costa@uni.example', 2, 5),
  (9, 'Sofia Romano', 'sofia.romano@uni.example', 1, 7),
  (10, 'Omar Haddad', 'omar.haddad@uni.example', 3, 2),
  (11, 'Ingrid Larsen', 'ingrid.larsen@uni.example', 2, 4),
  (12, 'Diego Herrera', 'diego.herrera@uni.example', 4, 3),
  (13, 'Robert''); DROP TABLE students;--', 'bobby.tables@uni.example', 1, NULL),
  (14, 'Fatima Zahra', 'fatima.zahra@uni.example', 3, 6),
  (15, 'Jonas Berg', 'jonas.berg@uni.example', 2, 5),
  (16, 'Mei Lin', 'mei.lin@uni.example', 4, 1),
  (17, 'Kwame Mensah', 'kwame.mensah@uni.example', 1, 7),
  (18, 'Clara Novak', 'clara.novak@uni.example', 3, 4),
  (19, 'Arjun Mehta', 'arjun.mehta@uni.example', 2, 2),
  (20, 'Elena Petrov', 'elena.petrov@uni.example', 4, 6),
  (21, 'Alex Kim', 'alex.kim@uni.example', 2, 3),
  (22, 'Zara Ahmed', 'zara.ahmed@uni.example', 1, 5),
  (23, 'Hugo Martin', 'hugo.martin@uni.example', 3, 1),
  (24, 'Yuna Park', NULL, 2, 4),
  (25, 'Felix Wagner', 'felix.wagner@uni.example', 4, 2),
  (26, 'Leila Karimi', 'leila.karimi@uni.example', 1, 6),
  (27, 'Mateo Garcia', 'mateo.garcia@uni.example', 3, 3),
  (28, 'Ananya Rao', 'ananya.rao@uni.example', 2, 1),
  (29, 'Ivan Sokolov', 'ivan.sokolov@uni.example', 4, 7),
  (30, 'Nora Jensen', 'nora.jensen@uni.example', 1, 4),
  (31, 'Tariq Aziz', 'tariq.aziz@uni.example', 3, 5),
  (32, 'Bianca Ferri', 'bianca.ferri@uni.example', 2, 2),
  (33, 'Alex Kim', 'alex.kim2@uni.example', 4, 6),
  (34, 'Ravi Shankar', 'ravi.shankar@uni.example', 1, 3),
  (35, 'Ama Owusu', 'ama.owusu@uni.example', 3, 1),
  (36, 'Lars Eriksson', 'lars.eriksson@uni.example', 2, NULL),
  (37, 'Sana Malik', 'sana.malik@uni.example', 4, 4),
  (38, 'Mateus Lima', 'mateus.lima@uni.example', 1, 2),
  (39, 'Valentina Cruz', 'valentina.cruz@uni.example', 3, 5),
  (40, 'Sam Rivera', 'sam.rivera@uni.example', 1, 8);

INSERT INTO courses (code, title, dept, credits, instructor_id) VALUES
  ('CS101', 'Intro to Programming', 'CS', 4, 1),
  ('CS201', 'Data Structures', 'CS', 4, 2),
  ('CS301', 'Databases', 'CS', 4, 1),
  ('CS350', 'Operating Systems', 'CS', 4, 2),
  ('CS401', 'Database Internals', 'CS', 4, 3),
  ('CS499', 'Senior Thesis', 'GEN', 6, NULL),
  ('MATH101', 'Calculus I', 'MATH', 4, 4),
  ('MATH201', 'Discrete Math', 'MATH', 3, 5),
  ('MATH301', 'Linear Algebra', 'MATH', 3, 4),
  ('PHYS101', 'Mechanics', 'PHYS', 4, 6),
  ('PHYS201', 'Electromagnetism', 'PHYS', 4, 6),
  ('HIST101', 'History of Computing', 'HIST', 3, 7);

INSERT INTO prerequisites (course_code, requires_code) VALUES
  ('CS201', 'CS101'),
  ('CS301', 'CS201'),
  ('CS301', 'MATH201'),
  ('CS350', 'CS201'),
  ('CS350', 'MATH201'),
  ('CS401', 'CS301'),
  ('CS401', 'MATH301'),
  ('CS499', 'CS350'),
  ('CS499', 'CS401'),
  ('MATH201', 'MATH101'),
  ('MATH301', 'MATH101'),
  ('PHYS101', 'MATH101'),
  ('PHYS201', 'MATH301'),
  ('PHYS201', 'PHYS101');

-- the term follows the course level: 1xx last fall, 2xx this spring, 3xx and up this fall.
-- grades skew toward B; this fall's courses aren't graded yet.
INSERT INTO enrollments (student_id, course_code, term, grade)
SELECT s.id,
       c.code,
       t.term,
       CASE WHEN t.term = '2026-fall' THEN NULL
            ELSE (ARRAY['A', 'A', 'B', 'B', 'B', 'C', 'C', 'D', 'F'])[1 + gen.pick(s.id * 16 + c.n, 52, 9)]
       END
FROM students AS s
CROSS JOIN (SELECT code, row_number() OVER (ORDER BY code)::int AS n, dept FROM courses WHERE code <> 'CS499') AS c
CROSS JOIN LATERAL (SELECT CASE
                             WHEN c.code ~ '[a-zA-Z]1[0-9][0-9]$' THEN '2025-fall'
                             WHEN c.code ~ '[a-zA-Z]2[0-9][0-9]$' THEN '2026-spring'
                             ELSE '2026-fall'
                           END AS term) AS t
WHERE s.id <> 40
  AND ((s.id = 7 AND c.dept = 'CS') OR gen.pick(s.id * 16 + c.n, 55, 100) < 37)
ORDER BY s.id, c.code;

-- the first 30 enrollments with everything repeated. the second of Hannah Okoye's rows has the
-- update anomaly: a different office for the same instructor.
INSERT INTO enrollments_flat (student_name, student_email, course_code, course_title, instructor_name, instructor_office, term, grade)
SELECT s.name,
       s.email,
       c.code,
       c.title,
       i.name,
       CASE WHEN i.id = 1 AND row_number() OVER (PARTITION BY i.id ORDER BY x.n) = 2 THEN 'B-199' ELSE i.office END,
       e.term,
       e.grade
FROM (SELECT e.*, row_number() OVER (ORDER BY e.student_id, e.course_code) AS n FROM enrollments AS e) AS x
JOIN enrollments AS e ON e.student_id = x.student_id AND e.course_code = x.course_code AND e.term = x.term
JOIN students AS s ON s.id = e.student_id
JOIN courses AS c ON c.code = e.course_code
LEFT JOIN instructors AS i ON i.id = c.instructor_id
WHERE x.n <= 30
ORDER BY x.n;

DROP SCHEMA gen CASCADE;
