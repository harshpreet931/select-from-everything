-- @title array subscripts, four array operators on shop's product tags, unnest with ordinality, and a GIN index on tags
-- @engine pglite
-- @db shop
-- @each

-- the array strip, the operator switch, the unnest pair and the plan on types/arrays read this.

-- @step T1 "an array, its first element, a subscript that doesn't exist, and a slice. subscripts start at 1."
SELECT a AS tags, a[1] AS first, a[0] AS zeroth, a[2:3] AS slice
FROM (SELECT ARRAY['eco', 'new', 'sale', 'gift'] AS a) AS s;

-- @step T1 "= ANY: steel is one of the elements."
SELECT id, name, tags FROM products WHERE 'steel' = ANY (tags) ORDER BY id LIMIT 6;

-- @step T1 "@> contains: every element on the right is in tags. order doesn't matter."
SELECT id, name, tags FROM products WHERE tags @> '{new,eco}' ORDER BY id LIMIT 6;

-- @step T1 "&& overlaps: at least one element in common."
SELECT id, name, tags FROM products WHERE tags && '{sale,free}' ORDER BY id LIMIT 6;

-- @step T1 "<@ is contained by: every element of tags is in the list. an empty array is contained in anything."
SELECT id, name, tags FROM products WHERE tags <@ '{steel,iron,sharp}' ORDER BY id LIMIT 6;

-- @step T1 "four products, one array each."
SELECT id, tags FROM products WHERE id IN (1, 3, 5, 7) ORDER BY id;

-- @step T1 "unnest turns each element into a row. WITH ORDINALITY numbers them. product 3's empty array makes no rows at all."
SELECT p.id, t.tag, t.pos
FROM products AS p
CROSS JOIN LATERAL unnest(p.tags) WITH ORDINALITY AS t (tag, pos)
WHERE p.id IN (1, 3, 5, 7)
ORDER BY p.id, t.pos;

-- @step T1 "20,000 posts with one to three tags each, and a GIN index on the tags."
CREATE TABLE posts AS
SELECT i AS id,
       (ARRAY['sql', 'postgres', 'mysql', 'sqlite', 'indexes', 'mvcc', 'wal', 'json'])[1 + (hashint4(i) & 7)]
       || CASE WHEN i % 2 = 0 THEN ARRAY[(ARRAY['news', 'howto', 'opinion'])[1 + (hashint4(i * 3) & 1)]] ELSE '{}' END
       || CASE WHEN i % 97 = 0 THEN ARRAY['rare'] ELSE '{}' END AS tags
FROM generate_series(1, 20000) AS i;
CREATE INDEX posts_tags ON posts USING gin (tags);
ANALYZE posts;

-- @explain T1 "the GIN index finds the 206 posts tagged rare without reading the other 19,794."
SELECT count(*) FROM posts WHERE tags @> '{rare}';
