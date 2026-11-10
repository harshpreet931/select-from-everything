-- @title a logged and an unlogged table, both loaded and committed, then the server crashes
-- @sessions T1
-- @each

-- @setup
CREATE TABLE logged (id int PRIMARY KEY, note text NOT NULL);
CREATE UNLOGGED TABLE unlogged (id int PRIMARY KEY, note text NOT NULL);

-- @step T1 "the same 10,000 rows into each table, committed."
INSERT INTO logged SELECT g, 'row ' || g FROM generate_series(1, 10000) AS g;
INSERT INTO unlogged SELECT g, 'row ' || g FROM generate_series(1, 10000) AS g;

-- @step T1 "both tables have their rows."
SELECT 'logged' AS tbl, count(*) AS n FROM logged
UNION ALL
SELECT 'unlogged', count(*) FROM unlogged
ORDER BY tbl;

-- @step obs "a checkpoint: every dirty page, of both tables, is written to disk."
CHECKPOINT;

-- @crash "the server is killed: pg_ctl stop -m immediate."

-- @restart +log "it starts again and runs crash recovery."

-- @step T1 "the logged table is intact. the unlogged one is empty: after a crash, postgres resets every unlogged table to empty, even data that was written out by the checkpoint."
SELECT 'logged' AS tbl, count(*) AS n FROM logged
UNION ALL
SELECT 'unlogged', count(*) FROM unlogged
ORDER BY tbl;
