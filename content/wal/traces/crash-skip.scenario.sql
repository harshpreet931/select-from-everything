-- @title full_page_writes off: a page written before the crash makes redo skip records it already has
-- @sessions T1
-- @server full_page_writes=off
-- @each xids wal buffers heap(notes)

-- @setup
CREATE TABLE notes (id int, body text NOT NULL);
INSERT INTO notes VALUES (1, 'before the checkpoint');

-- @step obs "a checkpoint: every dirty page is on disk, and the redo pointer moves here."
CHECKPOINT;

-- @step T1 "T1 inserts row 2. with full_page_writes off, the record carries no page image, just the new tuple."
INSERT INTO notes VALUES (2, 'on disk before the crash');

-- @step obs "the page is pushed out of shared buffers. the WAL up to its LSN is flushed first, then the page goes to the file, and its pd_lsn says it already has row 2."
SELECT buffer_evicted FROM pg_buffercache_evict((SELECT bufferid FROM pg_buffercache WHERE relfilenode = pg_relation_filenode('notes') AND relforknumber = 0 AND reldatabase = (SELECT oid FROM pg_database WHERE datname = current_database())));

-- @step T1 "T1 inserts row 3. the page is read back in and changed again, only in memory this time."
INSERT INTO notes VALUES (3, 'only in the WAL');

-- @crash "the server dies. on disk: the page with rows 1 and 2, and the WAL with both inserts."

-- @restart +log "recovery replays from the redo pointer. row 2's record is older than the page on disk, so it is skipped; row 3's is newer, so it is applied."

-- @step T1 "all three rows, once each. had redo applied row 2's insert to a page that already had it, it would have tried to put a tuple in a slot that was taken."
SELECT id, body FROM notes ORDER BY id;
