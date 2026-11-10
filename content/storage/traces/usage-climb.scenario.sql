-- @title one page read again and again: its usage count climbs to 5 and stops
-- @engine pglite
-- @db lab
-- @sessions T1
-- @each buffers

-- @step T1 "start cold: drop the lab's accounts page out of shared buffers."
SELECT buffers_evicted FROM pg_buffercache_evict_relation('accounts');

-- @step T1 "the first scan reads the page in. usage count 1."
SELECT count(*) FROM accounts;

-- @step T1 "a second scan is a hit. usage 2."
SELECT count(*) FROM accounts;

-- @step T1 "a third. usage 3."
SELECT count(*) FROM accounts;

-- @step T1 "a fourth. usage 4."
SELECT count(*) FROM accounts;

-- @step T1 "a fifth. usage 5, the most it can hold."
SELECT count(*) FROM accounts;

-- @step T1 "a sixth. still 5: the count is capped, so a page can't bank popularity for later."
SELECT count(*) FROM accounts;
