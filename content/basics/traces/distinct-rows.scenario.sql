-- @title DISTINCT and DISTINCT ON on school's 12 courses
-- @engine pglite
-- @db school
-- @each

-- @stages T1 "SELECT DISTINCT dept, credits"
SELECT DISTINCT dept, credits
FROM courses
ORDER BY dept, credits;
-- @stage FROM "FROM hands over all 12 courses."
SELECT code, dept, credits FROM courses ORDER BY code;
-- @stage SELECT "SELECT keeps two columns. now the rows repeat: five courses are CS with 4 credits, and they all look like CS, 4."
SELECT dept, credits FROM courses ORDER BY code;
-- @stage DISTINCT "DISTINCT compares whole output rows and keeps one of each. 12 rows become 6: the same pairs GROUP BY dept, credits would make buckets of."
SELECT DISTINCT dept, credits FROM courses ORDER BY dept, credits;
-- @stage ORDER BY "and then they're sorted. DISTINCT doesn't promise an order of its own."
SELECT DISTINCT dept, credits FROM courses ORDER BY dept, credits;

-- @stages T1 "the course with the most credits in each department"
SELECT DISTINCT ON (dept) dept, code, credits, title
FROM courses
ORDER BY dept, credits DESC, code;
-- @stage FROM "FROM hands over all 12 courses."
SELECT dept, code, credits, title FROM courses ORDER BY code;
-- @stage ORDER BY "ORDER BY sorts them by dept, then by credits from most to least, then by code. that decides which row comes first in each department."
SELECT dept, code, credits, title FROM courses ORDER BY dept, credits DESC, code;
-- @stage DISTINCT ON "DISTINCT ON (dept) keeps the first row of each dept and drops the rest. one row per department, and you chose which one."
SELECT DISTINCT ON (dept) dept, code, credits, title FROM courses ORDER BY dept, credits DESC, code;
