-- @title a seq scan of events from an empty pool, with reads combined and then one block at a time
-- @db events
-- @sessions T1
-- @each

-- @step T1 "warm up the catalogs, so the reads below are events' own."
SELECT count(*) FROM events;

-- @step obs "evict events and zero the I/O counters."
SELECT pg_buffercache_evict_relation('events'), pg_stat_reset_shared('io');

-- @step T1 "scan it cold, with the default io_combine_limit of 128 kB, and send the counters in."
SELECT sum(length(kind)) FROM events;
SELECT pg_stat_force_next_flush();

-- @step obs "335 pages came in. how many read operations did that take?"
SELECT backend_type, reads, read_bytes, round(read_bytes / reads / 1024.0, 1) AS kb_per_read
FROM pg_stat_io WHERE object = 'relation' AND reads > 0
ORDER BY backend_type;

-- @step T1 "again, but one block per read."
SET io_combine_limit = 1;
SELECT pg_buffercache_evict_relation('events'), pg_stat_reset_shared('io');
SELECT sum(length(kind)) FROM events;
SELECT pg_stat_force_next_flush();

-- @step obs "the same 335 pages, now one read each."
SELECT backend_type, reads, read_bytes, round(read_bytes / reads / 1024.0, 1) AS kb_per_read
FROM pg_stat_io WHERE object = 'relation' AND reads > 0
ORDER BY backend_type;
