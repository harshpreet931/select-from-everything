-- @title the lock queue: a long read, an ALTER TABLE behind it, and every reader behind that
-- @sessions T1 T2 T3 T4
-- @each locks

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T1 "T1 is a report. it opens a transaction and reads accounts, so it holds ACCESS SHARE on the table until it ends."
BEGIN;
SELECT sum(balance) FROM accounts;

-- @step T2 blocks "T2 is a migration. ALTER TABLE ... ADD COLUMN wants ACCESS EXCLUSIVE, which conflicts with T1's ACCESS SHARE, so it queues."
ALTER TABLE accounts ADD COLUMN note text;

-- @step T3 blocks "T3 is an ordinary read. ACCESS SHARE is compatible with T1's, but a lock request also has to get past everyone already queued, and T2's ACCESS EXCLUSIVE is in the way. T3 queues behind T2."
SELECT balance FROM accounts WHERE id = 1;

-- @step T4 blocks "T4, another read, queues too. from here on, every query that touches accounts waits."
SELECT balance FROM accounts WHERE id = 2;

-- @step obs "who blocks whom, from pg_locks and pg_blocking_pids. T2 is blocked by T1 (a lock T1 holds), T3 and T4 by T2 (a lock T2 is only waiting for)."
SELECT a.application_name AS session, l.mode, l.granted,
       ARRAY(SELECT b.application_name FROM pg_stat_activity b
             WHERE b.pid = ANY (pg_blocking_pids(a.pid))
             ORDER BY b.application_name) AS blocked_by
FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.locktype = 'relation' AND l.relation = 'accounts'::regclass
ORDER BY l.granted DESC, l.waitstart NULLS FIRST, a.application_name;

-- @step T1 "the report finishes. T2 gets ACCESS EXCLUSIVE, adds the column, and lets go. then T3 and T4 get their reads."
COMMIT;

-- @step obs "round two: the same migration, with lock_timeout."
SELECT 'round two' AS round;

-- @step T1 "T1 starts another long report."
BEGIN;
SELECT sum(balance) FROM accounts;

-- @step T2 "this time the migration sets lock_timeout first."
SET lock_timeout = '2s';

-- @step T2 blocks errors=55P03 "T2 queues for ACCESS EXCLUSIVE again, but now it will give up after two seconds."
ALTER TABLE accounts ADD COLUMN memo text;

-- @step T3 blocks "T3 queues behind T2, like before."
SELECT balance FROM accounts WHERE id = 1;

-- @step obs "two seconds later: T2 gave up with 55P03 and left the queue, so T3 got its ACCESS SHARE and finished. the report never noticed."
SELECT pg_sleep(2);

-- @step T1 "the report ends."
COMMIT;

-- @step T2 "the retry: nothing holds accounts now, so the ALTER gets its lock at once."
ALTER TABLE accounts ADD COLUMN memo text;
