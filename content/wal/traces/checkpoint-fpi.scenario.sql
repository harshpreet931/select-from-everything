-- @title a checkpoint, its log lines, and the full-page image the next change writes
-- @sessions T1
-- @each wal

-- @setup
CREATE TABLE notes (id int, body text NOT NULL);
INSERT INTO notes SELECT g, 'note ' || g || ': ' || repeat('.', 40) FROM generate_series(1, 60) AS g;

-- @step obs +log "CHECKPOINT writes every dirty buffer out, fsyncs the files, then logs where redo would start."
CHECKPOINT;

-- @step T1 "the first change to page 0 since the checkpoint: the WAL record carries a copy of the whole page."
UPDATE notes SET body = 'changed once' WHERE id = 1;

-- @step T1 "a second change to the same page: the page is already in the log since the checkpoint, so only the change goes in."
UPDATE notes SET body = 'changed twice' WHERE id = 2;

-- @step obs +log "another checkpoint. the redo pointer moves past both updates."
CHECKPOINT;

-- @step T1 "the first change since the new checkpoint pays for a full page again."
UPDATE notes SET body = 'changed again' WHERE id = 3;
