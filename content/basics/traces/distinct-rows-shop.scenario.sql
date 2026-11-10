-- @title what counts as a duplicate: the shop's first twelve customers, four ways
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "by name: the two Sam Lees are one row, though they're two people. Zoë and Zoe Martin stay apart: ë isn't e."
SELECT DISTINCT name
FROM customers
WHERE id <= 12
ORDER BY name;

-- @step T1 "by name and city: Toronto's Sam and Seoul's Sam are different rows again. a whole row has to match to be a duplicate."
SELECT DISTINCT name, city
FROM customers
WHERE id <= 12
ORDER BY name, city;

-- @step T1 "by email: Grace and Ana have no email, and DISTINCT keeps one NULL for the two of them. for DISTINCT, NULLs are duplicates of each other."
SELECT DISTINCT email
FROM customers
WHERE id <= 12
ORDER BY email;

-- @step T1 "by lower(email): DISTINCT compares what SELECT computed, so the two Zoe Martin emails, which differ only in capitals, collapse into one."
SELECT DISTINCT lower(email) AS email
FROM customers
WHERE id <= 12
ORDER BY email;
