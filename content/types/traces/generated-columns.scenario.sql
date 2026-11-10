-- @title one row with a stored and a virtual generated column on the page, adding each kind to a 25,000-row table, five refused expressions, and an index for a virtual column
-- @engine pglite
-- @db events
-- @ext pageinspect
-- @each

-- the tuple switch, the ALTER switch, the restriction switch and the plan on types/generated-columns read this.

-- @step T1 "two tables, the same three columns and a total computed from them: VIRTUAL in one, STORED in the other."
CREATE TABLE line_v (id int, qty int, price numeric, total numeric GENERATED ALWAYS AS (qty * price) VIRTUAL);
CREATE TABLE line_s (id int, qty int, price numeric, total numeric GENERATED ALWAYS AS (qty * price) STORED);
INSERT INTO line_v (id, qty, price) VALUES (1, 3, 2.50);
INSERT INTO line_s (id, qty, price) VALUES (1, 3, 2.50);

-- @step T1 "the stored row on its page: four columns of data, total included, and no null bitmap."
SELECT lp, lp_len, t_bits AS null_bitmap, t_data FROM heap_page_items(get_raw_page('line_s', 0)) ORDER BY lp;

-- @step T1 "the virtual row: 7 bytes shorter. the null bitmap's fourth bit is 0: total is stored as a NULL and computed on every read."
SELECT lp, lp_len, t_bits AS null_bitmap, t_data FROM heap_page_items(get_raw_page('line_v', 0)) ORDER BY lp;

-- @step T1 "events before: its file number and size."
SELECT pg_relation_filenode('events') AS file, pg_relation_size('events') / 8192 AS pages;

-- @step T1 "a VIRTUAL column added: same file, same size. nothing was written."
ALTER TABLE events ADD COLUMN page text GENERATED ALWAYS AS (props ->> 'page') VIRTUAL;
SELECT pg_relation_filenode('events') AS file, pg_relation_size('events') / 8192 AS pages;

-- @step T1 "a STORED column added: a new file, and bigger. every row was rewritten with the value in it."
ALTER TABLE events ADD COLUMN page_stored text GENERATED ALWAYS AS (props ->> 'page') STORED;
SELECT pg_relation_filenode('events') AS file, pg_relation_size('events') / 8192 AS pages;

-- @step T1 errors=42P17 "now() changes every time it's called, so it's not immutable."
CREATE TABLE g1 (a int, b timestamptz GENERATED ALWAYS AS (now()));

-- @step T1 errors=42P17 "timestamptz to text depends on the TimeZone setting, so it isn't immutable either."
CREATE TABLE g2 (a timestamptz, b text GENERATED ALWAYS AS (a::text) STORED);

-- @step T1 errors=42P17 "a generated column can't use another generated column."
CREATE TABLE g3 (a int, b int GENERATED ALWAYS AS (a + 1), c int GENERATED ALWAYS AS (b * 2));

-- @step T1 errors=0A000 "no subqueries: only the row itself."
CREATE TABLE g4 (a int, b int GENERATED ALWAYS AS ((SELECT max(id) FROM events)) STORED);

-- @step T1 errors=0A000 "a virtual column can't call a function you wrote, even an immutable one. a stored one can."
CREATE FUNCTION twice(x int) RETURNS int LANGUAGE sql IMMUTABLE RETURN x * 2;
CREATE TABLE g5 (a int, b int GENERATED ALWAYS AS (twice(a)) VIRTUAL);

-- @step T1 errors=0A000 "a virtual column can't be indexed."
CREATE INDEX ON events (page);

-- @step T1 "but its expression can, and a query on the virtual column is rewritten to the expression."
CREATE INDEX events_page ON events ((props ->> 'page'));
ANALYZE events;

-- @explain T1 "the expression index serves a WHERE on the virtual column."
SELECT count(*) FROM events WHERE page = '/p/17';
