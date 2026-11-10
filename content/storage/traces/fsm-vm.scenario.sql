-- @title an 8-page table: a delete, an insert, a vacuum, another insert, an update. free space map and visibility map after each
-- @engine pglite
-- @db lab
-- @sessions T1
-- @each

-- @setup
CREATE TABLE t (id int PRIMARY KEY, pad text);
INSERT INTO t SELECT g, repeat('x', 200) FROM generate_series(1, 272) AS g ORDER BY g;
-- one row per heap page: live and dead bytes (tuples rounded up to 8), the free gap, the two
-- visibility map bits, and what the free space map says about the page
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

-- @step T1 "272 rows, 34 to a page, 8 pages, all live. never vacuumed, so no page has a visibility map bit yet."
SELECT * FROM page_stats('t');

-- @step T1 "delete the rows on pages 2 and 5. the tuples stay, dead. the free space map doesn't hear about it."
DELETE FROM t WHERE id BETWEEN 69 AND 102 OR id BETWEEN 171 AND 204;
SELECT * FROM page_stats('t');

-- @step T1 "insert a row. the free space map has nothing to offer, so it goes on the last page."
INSERT INTO t VALUES (1001, repeat('y', 200));
SELECT * FROM page_stats('t');

-- @step T1 "VACUUM. the dead tuples go, pages 2 and 5 are empty, the free space map learns about every page, and every page gets both visibility bits."
VACUUM t;
SELECT * FROM page_stats('t');

-- @step T1 "insert another row. the free space map points at page 2 now."
INSERT INTO t VALUES (1002, repeat('y', 200));
SELECT * FROM page_stats('t');

-- @step T1 "update a row on page 6. the new version has to go to another page, and both pages lose their visibility bits."
UPDATE t SET pad = repeat('z', 200) WHERE id = 210;
SELECT * FROM page_stats('t');
