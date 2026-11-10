-- @title synchronous_commit off: COMMIT returns before the flush, and a crash takes the commit back
-- @sessions T1 T2
-- @session T2 synchronous_commit=off
-- @each xids wal heap(notes)

-- @setup
CREATE TABLE notes (id int, body text NOT NULL);
INSERT INTO notes VALUES (1, 'before the checkpoint');

-- @step obs "a checkpoint. the WAL is flushed up to here."
CHECKPOINT;

-- @step T1 "T1 inserts row 2 with synchronous_commit on, the default. COMMIT waits until its commit record is on disk."
INSERT INTO notes VALUES (2, 'synchronous commit');

-- @step T2 "T2 inserts row 3 with synchronous_commit off. COMMIT returns as soon as the commit record is in wal_buffers, and T2 is told it committed."
INSERT INTO notes VALUES (3, 'asynchronous commit');

-- @crash "the server dies before the WAL writer got round to flushing. T2's records were only in memory."

-- @restart +log "recovery replays what reached the disk: T1's insert and commit. T2's records never got there."

-- @step T1 "row 3 is gone, though its client was told COMMIT succeeded. row 2 survived: its COMMIT waited for the disk."
SELECT id, body FROM notes ORDER BY id;
