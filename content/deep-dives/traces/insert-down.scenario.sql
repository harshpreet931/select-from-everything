-- @title one INSERT into a table with a primary key, from BEGIN to the page on disk
-- @sessions T1
-- @server log_min_messages=info
-- @each xids buffers wal heap(notes, 0) btree(notes_pkey) vm(notes)

-- @setup
CREATE TABLE notes (id int PRIMARY KEY, body text NOT NULL);
INSERT INTO notes VALUES (1, 'the first note'), (2, 'the second note');
VACUUM notes;

-- @step obs +log "a checkpoint first, so the story starts clean: every page on disk, and the redo pointer right here."
CHECKPOINT;

-- @step T1 "BEGIN. no transaction id yet, and nothing written anywhere: postgres hands out an xid only when a transaction first changes something."
BEGIN;

-- @step T1 "the INSERT. a new tuple lands on page 0 of the heap, a new entry on the index leaf, and two WAL records describe both. both pages are dirty in shared buffers, and nothing has touched the disk yet."
INSERT INTO notes VALUES (3, 'hello from the capstone');

-- @step T1 "COMMIT. one more WAL record, the commit, and this time the WAL is flushed to disk before COMMIT returns. the commit log now says the xid committed. the table pages are still only in memory."
COMMIT;

-- @step T1 "a reader looks at the new row. its xmin isn't hinted yet, so the reader asks the commit log, gets committed, and writes that down as a hint bit on the tuple."
SELECT ctid, xmin, id, body FROM notes WHERE id = 3;

-- @step obs +log "a checkpoint. every dirty buffer is written to the data files and fsynced, and the redo pointer moves past our records."
CHECKPOINT;

-- @step obs "the page on disk, read straight from the file with pg_read_binary_file, not through shared buffers: the new tuple is in it, with the same LSN the buffer had."
SELECT lp, lp_off, lp_len, t_xmin, t_ctid, (page_header(pg_read_binary_file(pg_relation_filepath('notes'), 0, 8192))).lsn AS page_lsn
FROM heap_page_items(pg_read_binary_file(pg_relation_filepath('notes'), 0, 8192))
ORDER BY lp;

-- @step obs "the INSERT's two WAL records, block by block, with pg_get_wal_block_info: which page each image is of, and how big."
SELECT r.record_type, c.relname, b.relforknumber AS fork, b.relblocknumber AS block, b.block_fpi_length AS fpi_bytes
FROM pg_get_wal_block_info('0/1622480', '0/1624638') AS b
JOIN pg_get_wal_records_info('0/1622480', '0/1624638') AS r USING (start_lsn)
JOIN pg_class AS c ON c.relfilenode = b.relfilenode
ORDER BY b.start_lsn, b.block_id;
