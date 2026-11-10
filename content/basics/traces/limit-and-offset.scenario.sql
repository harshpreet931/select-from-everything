-- @title LIMIT on school's tables: no ORDER BY before and after an UPDATE, and WITH TIES
-- @engine pglite
-- @db school
-- @each

-- @step T1 "no ORDER BY: postgres reads the table front to back and stops after three. today that's students 1, 2 and 3."
SELECT id, name, year
FROM students
LIMIT 3;

-- @step T1 "one UPDATE that changes nothing you can see writes a new version of student 1 at the end of the page. the same LIMIT 3 now starts at student 2."
UPDATE students SET year = year WHERE id = 1;
SELECT id, name, year
FROM students
LIMIT 3;

-- @stages T1 "asked for 3, got 9"
SELECT code, credits, title
FROM courses
ORDER BY credits DESC
FETCH FIRST 3 ROWS WITH TIES;
-- @stage FROM "FROM hands over all 12 courses, in no particular order."
SELECT code, credits, title FROM courses ORDER BY code;
-- @stage ORDER BY "sorted by credits, highest first. the thesis has 6, then eight courses tie on 4. the ties are drawn in code order here, but any order would be just as correct."
SELECT code, credits, title FROM courses ORDER BY credits DESC, code;
-- @stage FETCH "the third row has 4 credits, and WITH TIES keeps every row that ties with it: all eight 4-credit courses. 9 rows for FETCH FIRST 3. only the three 3-credit courses go."
SELECT code, credits, title FROM courses ORDER BY credits DESC FETCH FIRST 3 ROWS WITH TIES;
