-- @title insert, commit, crash, restart: the WAL puts it back
-- @sessions T1 T2
-- @each xids wal buffers heap(notes)

-- @setup
CREATE TABLE notes (
  id   int PRIMARY KEY,
  body text NOT NULL
);
INSERT INTO notes VALUES (1, 'before the checkpoint');

-- @step obs "a checkpoint writes every dirty page to disk. if we crash now, redo starts from here."
CHECKPOINT;

-- @step T2 "T2 starts a transaction it will never finish."
BEGIN;

-- @step T2 "its insert is the first change to the page since the checkpoint, so the WAL record carries a full copy of the page. it's only in memory so far: WAL buffer and shared buffer."
INSERT INTO notes VALUES (3, 'in flight at the crash');

-- @step T1 "T1 starts."
BEGIN;

-- @step T1 "T1 inserts into the same page. no full page image this time, just the new tuple."
INSERT INTO notes VALUES (2, 'committed');

-- @step T1 "COMMIT flushes the WAL up to T1's commit record, and everything before it, T2's insert included. the table page itself is still only in memory."
COMMIT;

-- @crash "the server process dies. shared buffers are gone, dirty page and all. the WAL on disk is all that's left."

-- @restart +log "on start, postgres sees it wasn't shut down cleanly and replays the WAL from the checkpoint's redo pointer."

-- @step T1 "row 2 is back. row 3 is on the page too, but T2 never committed, so after recovery its xid counts as aborted and nobody sees it."
SELECT id, body FROM notes ORDER BY id;
