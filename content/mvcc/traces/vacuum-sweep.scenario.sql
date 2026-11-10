-- @title a six-page table: delete two rows in three, VACUUM, then VACUUM FULL. page by page, with the index and the file sizes
-- @server log_min_messages=info
-- @sessions T1
-- @each

-- @setup
CREATE TABLE t (id int PRIMARY KEY, pad text NOT NULL);
INSERT INTO t SELECT g, repeat('x', 200) FROM generate_series(1, 204) AS g ORDER BY g;
VACUUM t;
-- one row per heap page: live and dead bytes (tuples rounded up to 8), the free gap, and the
-- two visibility map bits. dead = stamped with an xmax, which here always means deleted
CREATE FUNCTION page_stats(rel regclass)
RETURNS TABLE (blkno int, live bigint, dead bigint, free int, all_visible bool, all_frozen bool)
LANGUAGE sql AS $f$
  SELECT b,
         (SELECT coalesce(sum((lp_len + 7) / 8 * 8), 0) FROM heap_page_items(get_raw_page(rel::text, b)) WHERE lp_flags = 1 AND t_xmax = 0),
         (SELECT coalesce(sum((lp_len + 7) / 8 * 8), 0) FROM heap_page_items(get_raw_page(rel::text, b)) WHERE lp_flags = 1 AND t_xmax <> 0),
         (SELECT upper - lower FROM page_header(get_raw_page(rel::text, b))),
         v.all_visible, v.all_frozen
  FROM generate_series(0, (pg_relation_size(rel) / 8192)::int - 1) AS b
  JOIN pg_visibility_map(rel) AS v ON v.blkno = b
  ORDER BY b
$f$;

-- @step T1 "204 rows, 34 to a page, six pages, vacuumed once: every page is all-visible."
SELECT * FROM page_stats('t');

-- @step T1 +heap(t, 0) +btree(t_pkey, items=6) "delete two rows in every three. every page still holds all its tuples, two thirds of them dead, and loses its all-visible bit. the index still has 204 entries."
DELETE FROM t WHERE id % 3 <> 0;
SELECT * FROM page_stats('t');

-- @step T1 +heap(t, 0) +btree(t_pkey, items=6) +log "VACUUM. dead tuples go, their index entries go, and every page gets its visibility bits. still six pages."
VACUUM (VERBOSE) t;
SELECT * FROM page_stats('t');

-- @step T1 "VACUUM FULL writes the 68 live rows into a brand new file: two pages."
VACUUM FULL t;
SELECT * FROM page_stats('t');
