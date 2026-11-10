-- @title a 256-frame buffer pool, a small hot table, and two ways to read all of events
-- @db events
-- @server shared_buffers=2MB io_method=sync
-- @sessions T1
-- @each buffers

-- @setup
CREATE TABLE hot (id int PRIMARY KEY, pad text);
INSERT INTO hot SELECT g, repeat('h', 200) FROM generate_series(1, 680) AS g ORDER BY g;
VACUUM hot;

-- @step obs "start empty: 256 frames of 8 KB, and nothing of hot or events in them."
SELECT buffers_evicted FROM pg_buffercache_evict_all();

-- @step T1 "read the small table, twice. its 20 pages move in, and each read bumps their usage count."
SELECT sum(length(pad)) FROM hot;
SELECT sum(length(pad)) FROM hot;

-- @step T1 "a seq scan of events, 335 pages, more than a quarter of the pool. it gets a ring of 32 frames and goes round in it: hot is untouched."
SELECT sum(length(kind)) FROM events;

-- @step T1 "now read all of events through its index. an index scan gets no ring, so every page competes for the whole pool, and hot's pages are evicted."
SET enable_seqscan = off;
SET enable_bitmapscan = off;
SELECT sum(user_id) FROM events WHERE id > 0;
