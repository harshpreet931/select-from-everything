-- @title pages of 20 events, by OFFSET and by keyset, from the first page to page 1,001
-- @engine pglite
-- @db events
-- @each

-- keyset-pagination reads this file. events has 25,000 rows in time order; the index is on
-- (occurred_at, id). each page is fetched twice: with OFFSET, and with WHERE (occurred_at, id) >
-- the last row of the page before (the cursor values come from the data: row 1,000 is id 1000).

-- @setup
CREATE INDEX events_at_id ON events (occurred_at, id);

-- @explain T1 "page 1 by OFFSET: nothing to skip."
SELECT id, user_id, kind, occurred_at FROM events ORDER BY occurred_at, id LIMIT 20 OFFSET 0;
-- @explain T1 "page 51 by OFFSET: read 1,020 rows, return the last 20."
SELECT id, user_id, kind, occurred_at FROM events ORDER BY occurred_at, id LIMIT 20 OFFSET 1000;
-- @explain T1 "page 251 by OFFSET: read 5,020 rows, return the last 20."
SELECT id, user_id, kind, occurred_at FROM events ORDER BY occurred_at, id LIMIT 20 OFFSET 5000;
-- @explain T1 "page 501 by OFFSET: read 10,020 rows, return the last 20."
SELECT id, user_id, kind, occurred_at FROM events ORDER BY occurred_at, id LIMIT 20 OFFSET 10000;
-- @explain T1 "page 1,001 by OFFSET: read 20,020 rows, return the last 20."
SELECT id, user_id, kind, occurred_at FROM events ORDER BY occurred_at, id LIMIT 20 OFFSET 20000;

-- @explain T1 "page 51 by keyset: start right after row 1,000 and read 20."
SELECT id, user_id, kind, occurred_at FROM events WHERE (occurred_at, id) > ('2026-03-04 15:17:30+00', 1000) ORDER BY occurred_at, id LIMIT 20;
-- @explain T1 "page 251 by keyset: one descent to the cursor, 20 rows."
SELECT id, user_id, kind, occurred_at FROM events WHERE (occurred_at, id) > ('2026-03-19 04:45:52+00', 5000) ORDER BY occurred_at, id LIMIT 20;
-- @explain T1 "page 501 by keyset."
SELECT id, user_id, kind, occurred_at FROM events WHERE (occurred_at, id) > ('2026-04-06 09:31:53+00', 10000) ORDER BY occurred_at, id LIMIT 20;
-- @explain T1 "page 1,001 by keyset: the same cost as page 51."
SELECT id, user_id, kind, occurred_at FROM events WHERE (occurred_at, id) > ('2026-05-13 19:07:46+00', 20000) ORDER BY occurred_at, id LIMIT 20;

-- @explain T1 "page 251, with the comparison spelled out as OR: the index can't start at the cursor, so the scan reads from the beginning and filters."
SELECT id, user_id, kind, occurred_at FROM events WHERE occurred_at > '2026-03-19 04:45:52+00' OR (occurred_at = '2026-03-19 04:45:52+00' AND id > 5000) ORDER BY occurred_at, id LIMIT 20;

-- @step T1 "the last row of page 250 and the first two of page 251: where the cursor points."
SELECT id, kind, occurred_at FROM events ORDER BY occurred_at, id LIMIT 3 OFFSET 4999;
