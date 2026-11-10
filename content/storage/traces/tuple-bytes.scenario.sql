-- @title the same four columns in two orders, and a NULL, byte by byte
-- @engine pglite
-- @db lab
-- @sessions T1
-- @each

-- @setup
CREATE TABLE loose (a bool, b int8, c bool, d int8);
CREATE TABLE tight (b int8, d int8, a bool, c bool);
INSERT INTO loose VALUES (true, 1, false, 2), (true, NULL, false, 2);
INSERT INTO tight VALUES (1, 2, true, false);

-- @step T1 "every tuple, raw: header, null bitmap if any, padding and data, straight off the page."
SELECT 'loose' AS t, lp, lp_len, t_hoff, t_bits,
       encode(substr(get_raw_page('loose', 0), lp_off + 1, lp_len), 'hex') AS bytes
FROM heap_page_items(get_raw_page('loose', 0))
UNION ALL
SELECT 'tight', lp, lp_len, t_hoff, t_bits,
       encode(substr(get_raw_page('tight', 0), lp_off + 1, lp_len), 'hex')
FROM heap_page_items(get_raw_page('tight', 0))
ORDER BY t, lp;

-- @step T1 "the same two column orders, 10,000 rows each: how big is each file?"
CREATE TABLE loose10k (a bool, b int8, c bool, d int8);
CREATE TABLE tight10k (b int8, d int8, a bool, c bool);
INSERT INTO loose10k SELECT true, g, false, g FROM generate_series(1, 10000) AS g;
INSERT INTO tight10k SELECT g, g, true, false FROM generate_series(1, 10000) AS g;
SELECT 'loose' AS t, pg_relation_size('loose10k') AS bytes
UNION ALL SELECT 'tight', pg_relation_size('tight10k')
ORDER BY t;
