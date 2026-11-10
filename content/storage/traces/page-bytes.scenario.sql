-- @title the first 36 bytes of the lab's accounts page: the header and three line pointers
-- @engine pglite
-- @db lab
-- @sessions T1
-- @each

-- @step T1 "drop the page from shared buffers, so the next read comes from the file, checksum and all."
SELECT buffers_evicted FROM pg_buffercache_evict_relation('accounts');

-- @step T1 "the header, decoded by page_header()."
SELECT lsn, checksum, flags, lower, upper, special, pagesize, version, prune_xid
FROM page_header(get_raw_page('accounts', 0));

-- @step T1 "the same 24 bytes raw, then the three 4-byte line pointers after them."
SELECT encode(substr(get_raw_page('accounts', 0), 1, 24), 'hex') AS header,
       encode(substr(get_raw_page('accounts', 0), 25, 12), 'hex') AS line_pointers;

-- @step T1 +heap(accounts, 0) "what the line pointers say: where each tuple starts and how long it is."
SELECT lp, lp_off, lp_flags, lp_len FROM heap_page_items(get_raw_page('accounts', 0)) ORDER BY lp;
