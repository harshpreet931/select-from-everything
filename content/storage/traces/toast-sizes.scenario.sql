-- @title one text column, values from 100 bytes to 1 MB, compressible and not
-- @engine pglite
-- @db lab
-- @sessions T1
-- @each

-- @setup
CREATE TABLE docs (id int PRIMARY KEY, kind text, body text);
INSERT INTO docs SELECT n, 'repetitive', repeat('a', n)
FROM unnest(ARRAY[100, 1000, 2000, 2100, 4000, 10000, 100000, 1000000]) AS n ORDER BY n;
INSERT INTO docs SELECT -n, 'random', (SELECT string_agg(md5(g::text), '' ORDER BY g) FROM generate_series(1, n / 32) AS g)
FROM unnest(ARRAY[96, 992, 2016, 2112, 4000, 10016, 100000, 1000000]) AS n ORDER BY n;
-- the toast table's name has the table's oid in it, which differs between engines, so look it up
CREATE FUNCTION toast_chunks(v text) RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  EXECUTE format('SELECT count(*) FROM %s WHERE chunk_id = $1',
                 (SELECT reltoastrelid::regclass FROM pg_class WHERE relname = 'docs'))
    INTO n USING pg_column_toast_chunk_id(v);
  RETURN n;
END $f$;

-- @step T1 "how each value was stored: its size, what it takes in the row, how it was compressed, and how many toast chunks it became."
SELECT d.kind, octet_length(d.body) AS bytes, pg_column_size(d.body) AS stored,
       pg_column_compression(d.body) AS method, h.lp_len AS tuple_len,
       toast_chunks(d.body) AS chunks
FROM docs d
JOIN heap_page_items(get_raw_page('docs', 0)) h ON h.t_ctid = d.ctid
ORDER BY d.kind, octet_length(d.body);
