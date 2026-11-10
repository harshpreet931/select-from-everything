-- @title seven customers against seven patterns, and the bytes the C collation sorts by
-- @engine pglite
-- @db shop
-- @each

-- @step T1 "the grid: each name against LIKE, ILIKE and a regular expression."
SELECT name,
       name LIKE 'S%' AS "s%",
       name LIKE '%Lee' AS "%lee",
       name LIKE 'Zo_ Martin' AS "zo_",
       name LIKE 'a%' AS "a%",
       name ILIKE 'a%' AS "ilike a%",
       name LIKE '%''%' AS "quote",
       name ~* 'lee|lima' AS "regex"
FROM customers
WHERE id IN (42, 3, 8, 4, 5, 10, 11)
ORDER BY id;

-- @step T1 "seven characters, sorted the way this page sorts them: by their UTF-8 bytes."
SELECT x AS character, encode(convert_to(x, 'UTF8'), 'hex') AS utf8_bytes
FROM (VALUES ('A'), ('Z'), ('a'), ('z'), ('e'), ('ë'), ('É')) AS t (x)
ORDER BY x;
