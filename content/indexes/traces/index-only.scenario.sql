-- @title an index-only scan before and after VACUUM, and after an UPDATE clears a few visibility bits
-- @engine pglite
-- @db shop
-- @each

-- index-only-scans reads this file. o is a fresh copy of orders, never vacuumed, with an index on
-- customer_id. the query only needs customer_id, so the index alone could answer it, if the
-- visibility map lets it.

-- @setup
CREATE TABLE o (LIKE orders);
INSERT INTO o SELECT * FROM orders ORDER BY id;
CREATE INDEX o_customer ON o (customer_id);
ANALYZE o;

-- @probe +vm(o) "a fresh copy of orders: 83 pages, and not one of them marked all-visible in the visibility map."

-- @explain T1 "a fresh table: no page is marked all-visible yet. postgres knows, and doesn't even try an index-only scan."
SELECT customer_id, count(*) FROM o WHERE customer_id <= 100 GROUP BY customer_id ORDER BY customer_id;

-- @step T1 "take the bitmap scan and the seq scan away, to see the index-only scan postgres turned down."
SET enable_bitmapscan = off;
SET enable_seqscan = off;

-- @explain T1 "an index-only scan in name only: every one of the 1,321 entries needs a trip to the heap to check visibility."
SELECT customer_id, count(*) FROM o WHERE customer_id <= 100 GROUP BY customer_id ORDER BY customer_id;

-- @step T1 +vm(o) "VACUUM: it checks every page, and marks the ones whose rows are all visible to everyone. that's all of them."
RESET enable_bitmapscan;
RESET enable_seqscan;
VACUUM o;

-- @explain T1 "the same query: an index-only scan, Heap Fetches: 0. the heap is never touched."
SELECT customer_id, count(*) FROM o WHERE customer_id <= 100 GROUP BY customer_id ORDER BY customer_id;

-- @step T1 +vm(o) "three orders get refunded. each update clears the all-visible bit of the page it touches, old version and new."
UPDATE o SET status = 'refunded' WHERE id IN (5, 4000, 8000);

-- @explain T1 "now the index entries that point into those pages need a heap fetch each, the rest still don't."
SELECT customer_id, count(*) FROM o WHERE customer_id <= 100 GROUP BY customer_id ORDER BY customer_id;

-- @step T1 +vm(o) "VACUUM again: it only has to visit the pages that lost their bit."
VACUUM o;

-- @explain T1 "back to Heap Fetches: 0."
SELECT customer_id, count(*) FROM o WHERE customer_id <= 100 GROUP BY customer_id ORDER BY customer_id;
