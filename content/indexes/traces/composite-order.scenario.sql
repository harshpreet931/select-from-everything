-- @title cancelled orders since january, with the index columns in either order
-- @engine pglite
-- @db shop
-- @each

-- composite-indexes reads this file: one query, an index on (status, ordered_at), then the same
-- columns the other way round, then the two single-column indexes people make instead.

-- @setup
CREATE INDEX orders_status_at ON orders (status, ordered_at);

-- @explain T1 "equality first: status = 'cancelled' picks one slice of the index, and the date range is a contiguous run inside it."
SELECT id FROM orders WHERE status = 'cancelled' AND ordered_at >= '2026-01-01';

-- @step T1 "now the other order: the range column first."
DROP INDEX orders_status_at;
CREATE INDEX orders_at_status ON orders (ordered_at, status);

-- @explain T1 "range first: postgres doesn't even want the index. it reads the table."
SELECT id FROM orders WHERE status = 'cancelled' AND ordered_at >= '2026-01-01';

-- @step T1 "take the seq scan away, to see what the index would have cost."
SET enable_seqscan = off;

-- @explain T1 "the index on (ordered_at, status) has to read every entry since january and check the status of each."
SELECT id FROM orders WHERE status = 'cancelled' AND ordered_at >= '2026-01-01';

-- @step T1 "two separate indexes instead of one on both columns."
RESET enable_seqscan;
DROP INDEX orders_at_status;
CREATE INDEX orders_status ON orders (status);
CREATE INDEX orders_ordered_at ON orders (ordered_at);

-- @explain T1 "two single-column indexes: postgres picks the status one and filters the dates on the heap."
SELECT id FROM orders WHERE status = 'cancelled' AND ordered_at >= '2026-01-01';

-- @step T1 "how many orders are in the date range, cancelled or not."
SELECT count(*) AS since_january FROM orders WHERE ordered_at >= '2026-01-01';
