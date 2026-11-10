-- @title WHERE on school's tables: one row at a time, and an OR without parentheses
-- @engine pglite
-- @db school
-- @each

-- @stages T1 "4-credit courses outside CS"
SELECT code, title
FROM courses
WHERE credits = 4 AND dept <> 'CS'
ORDER BY code;
-- @stage FROM "FROM hands over all 12 courses, drawn with the three that will survive on top, so you can watch the other 9 go."
SELECT code, dept, credits, title FROM courses ORDER BY (credits = 4 AND dept <> 'CS') DESC, code;
-- @stage WHERE "WHERE asks every row the same question, on its own: 4 credits, and not CS? 3 rows say true. the five CS courses pass the first test and fail the second, and they're as gone as the 3-credit ones."
SELECT code, dept, credits, title FROM courses WHERE credits = 4 AND dept <> 'CS' ORDER BY code;
-- @stage SELECT "SELECT keeps the two columns asked for. dept and credits did their job in WHERE, and don't have to be in the output."
SELECT code, title FROM courses WHERE credits = 4 AND dept <> 'CS' ORDER BY code;

-- @step T1 "without parentheses, AND goes first: every CS course, plus the MATH courses with 3 credits. seven rows."
SELECT code, dept, credits
FROM courses
WHERE dept = 'CS' OR dept = 'MATH' AND credits = 3
ORDER BY code;

-- @step T1 "with parentheses around the OR: CS or MATH first, then 3 credits. no CS course has 3, so two rows."
SELECT code, dept, credits
FROM courses
WHERE (dept = 'CS' OR dept = 'MATH') AND credits = 3
ORDER BY code;
