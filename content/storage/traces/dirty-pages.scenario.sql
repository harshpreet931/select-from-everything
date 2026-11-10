-- @title an UPDATE dirties pages, a CHECKPOINT cleans them, and pg_stat_io says who wrote
-- @server io_method=sync
-- @sessions T1
-- @each buffers

-- @setup
CREATE TABLE accounts (id int PRIMARY KEY, owner text NOT NULL, balance numeric(12,2) NOT NULL);
INSERT INTO accounts SELECT g, 'owner ' || g, 100.00 FROM generate_series(1, 600) AS g ORDER BY g;
VACUUM accounts;
CHECKPOINT;

-- @step T1 "read every row. four heap pages and the index's pages are in shared buffers, all clean: they match the file."
SELECT count(*), sum(balance) FROM accounts;

-- @step T1 "give every account 1.00. the new versions are written into the pages in memory, nowhere else. every heap page is dirty now, and so is the index."
UPDATE accounts SET balance = balance + 1;

-- @step obs "zero the I/O counters, so the next numbers are only the checkpoint's."
SELECT pg_stat_reset_shared('io'), pg_stat_reset_shared('checkpointer');

-- @step obs "CHECKPOINT. the checkpointer writes every dirty page to the file and fsyncs it. the frames stay, clean again."
CHECKPOINT;

-- @step obs "the checkpointer's own counters: how many pages it wrote, and how many files it fsynced."
SELECT c.buffers_written, i.writes, i.fsyncs
FROM pg_stat_checkpointer AS c,
     pg_stat_io AS i
WHERE i.backend_type = 'checkpointer' AND i.object = 'relation' AND i.context = 'normal';
