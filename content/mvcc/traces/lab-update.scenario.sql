-- @title one UPDATE on the lab's accounts table, captured in the browser's engine
-- @engine pglite
-- @db lab
-- @ext amcheck
-- @sessions T1
-- @each xids heap(accounts)

-- @probe "before: three rows, three tuples, one page. all written by the same transaction."

-- @step T1 "after: alice has a second tuple. the old one is still in slot 1, with T1's xid in xmax and a t_ctid that points at slot 4."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;
