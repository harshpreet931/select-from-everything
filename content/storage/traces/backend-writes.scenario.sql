-- @title an UPDATE bigger than a 256-frame pool, with the background writer off
-- @server shared_buffers=2MB io_method=sync
-- @sessions T1
-- @each

-- @setup
CREATE TABLE ledger (id int PRIMARY KEY, amount numeric(12,2) NOT NULL, memo text NOT NULL);
INSERT INTO ledger SELECT g, 10.00, repeat('m', 100) FROM generate_series(1, 20000) AS g ORDER BY g;
VACUUM ledger;
CHECKPOINT;

-- @step obs "the table is bigger than the whole pool."
SELECT pg_relation_size('ledger') / 8192 AS heap_pages, current_setting('shared_buffers') AS shared_buffers;

-- @step obs "zero the I/O counters."
SELECT pg_stat_reset_shared('io');

-- @step T1 "touch every row. each page gets dirty, and once the pool is full, every new page needs a frame that is probably holding a dirty one."
UPDATE ledger SET amount = amount + 1;

-- @step T1 "send this session's counters in."
SELECT pg_stat_force_next_flush();

-- @step obs "who wrote pages, and why. nobody else was running, so the backend doing the UPDATE wrote every dirty page it pushed out."
SELECT backend_type, sum(writes) AS pages_written
FROM pg_stat_io
WHERE object = 'relation'
GROUP BY backend_type
HAVING sum(writes) > 0
ORDER BY backend_type;
