-- @title one point lookup on customers, from an empty buffer pool and then again
-- @db shop
-- @server io_method=sync
-- @sessions T1
-- @each buffers

-- @step obs "empty the buffer pool. every page of shop is on disk (or in the OS page cache) and nowhere else."
SELECT buffers_evicted FROM pg_buffercache_evict_all();

-- @explain T1 "ada lovelace, cold. the plan reads 3 pages: the index root, a leaf, the heap page. the two index metapages came in while planning, so they are not in its count."
SELECT name, city FROM customers WHERE id = 42;

-- @explain T1 "the same lookup again: 3 hits, no reads. each hit adds one to its frame's usage count."
SELECT name, city FROM customers WHERE id = 42;
