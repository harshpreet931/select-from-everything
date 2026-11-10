-- @title the files behind the lab's notes table
-- @engine pglite
-- @db lab
-- @sessions T1
-- @each

-- @step T1 "where notes lives, and the sizes that decide how its files are cut."
SELECT pg_relation_filepath('notes') AS path, pg_relation_filenode('notes') AS relfilenode,
       current_setting('block_size') AS block_size, current_setting('segment_size') AS segment_size;

-- @step T1 "every file in the database's directory that belongs to notes: the table, its free space map, its toast table and their indexes."
SELECT c.relname, c.relkind, f.file, (pg_stat_file('base/5/' || f.file)).size AS bytes
FROM pg_class c
JOIN pg_ls_dir('base/5') AS f(file) ON f.file ~ ('^' || c.relfilenode || '(_[a-z]+)?(\.[0-9]+)?$')
WHERE c.oid IN ('notes'::regclass, 'notes_pkey'::regclass,
                (SELECT reltoastrelid FROM pg_class WHERE relname = 'notes'))
   OR c.oid = (SELECT indexrelid FROM pg_index WHERE indrelid = (SELECT reltoastrelid FROM pg_class WHERE relname = 'notes'))
ORDER BY f.file;

-- @step T1 "the top of the data directory."
SELECT d AS entry, (pg_stat_file(d)).isdir AS dir FROM pg_ls_dir('.') AS d
WHERE d IN ('base', 'global', 'pg_wal', 'pg_xact', 'pg_multixact', 'pg_tblspc', 'PG_VERSION')
ORDER BY d;
