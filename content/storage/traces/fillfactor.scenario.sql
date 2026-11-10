-- @title the same 232 rows at fillfactor 100 and 70, before and after updating every fourth row
-- @engine pglite
-- @db lab
-- @sessions T1
-- @each

-- @setup
CREATE TABLE full100 (id int PRIMARY KEY, n int, pad text) WITH (fillfactor = 100);
CREATE TABLE room70 (id int PRIMARY KEY, n int, pad text) WITH (fillfactor = 70);
INSERT INTO full100 SELECT g, 0, repeat('x', 100) FROM generate_series(1, 232) AS g ORDER BY g;
INSERT INTO room70 SELECT g, 0, repeat('x', 100) FROM generate_series(1, 232) AS g ORDER BY g;
CREATE FUNCTION page_stats(rel regclass)
RETURNS TABLE (blkno int, live bigint, dead bigint, free int, all_visible bool, all_frozen bool, fsm int)
LANGUAGE sql AS $f$
  SELECT b,
         (SELECT coalesce(sum((lp_len + 7) / 8 * 8), 0) FROM heap_page_items(get_raw_page(rel::text, b)) WHERE lp_flags = 1 AND t_xmax = 0),
         (SELECT coalesce(sum((lp_len + 7) / 8 * 8), 0) FROM heap_page_items(get_raw_page(rel::text, b)) WHERE lp_flags = 1 AND t_xmax <> 0),
         (SELECT upper - lower FROM page_header(get_raw_page(rel::text, b))),
         v.all_visible, v.all_frozen, pg_freespace(rel, b)::int
  FROM generate_series(0, (pg_relation_size(rel) / 8192)::int - 1) AS b
  JOIN pg_visibility_map(rel) AS v ON v.blkno = b
  ORDER BY b
$f$;

-- @step T1 "both tables, freshly loaded. at fillfactor 70 the inserts stopped at 70% of each page."
SELECT 'full100' AS rel, * FROM page_stats('full100')
UNION ALL SELECT 'room70', * FROM page_stats('room70')
ORDER BY rel, blkno;

-- @step T1 +heap(room70, 0) "every fourth row updated in both. at 100 the new versions had nowhere to go but a new page. at 70 every one stayed on its own page."
UPDATE full100 SET n = n + 1 WHERE id % 4 = 0;
UPDATE room70 SET n = n + 1 WHERE id % 4 = 0;
SELECT 'full100' AS rel, * FROM page_stats('full100')
UNION ALL SELECT 'room70', * FROM page_stats('room70')
ORDER BY rel, blkno;

-- @step T1 "what the update cost each table: new index entries, and how many updates stayed on their page (HOT)."
SELECT rel, (SELECT live_items FROM bt_page_stats(rel || '_pkey', 1)) - 232 AS new_index_entries,
       (SELECT count(*) FROM generate_series(0, (pg_relation_size(rel) / 8192)::int - 1) AS b,
               heap_page_items(get_raw_page(rel, b)) AS h
        WHERE (h.t_infomask2 & 16384) <> 0) AS hot_updates
FROM (VALUES ('full100'), ('room70')) AS v(rel)
ORDER BY rel;
