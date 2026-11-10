-- @title a small table from load to frozen: a VACUUM that sets all-visible, then VACUUM (FREEZE) that marks every tuple frozen
-- @sessions T1
-- @each heap(accounts) vm(accounts)

-- @setup
CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00), (3, 'carol', 50.00);

-- @step T1 "freshly loaded. every tuple carries the loading transaction's xid in xmin, and the table's relfrozenxid is that same horizon."
SELECT relfrozenxid, age(relfrozenxid) FROM pg_class WHERE relname = 'accounts';

-- @step T1 "a plain VACUUM. the page becomes all-visible, but these tuples are young, so nothing is frozen."
VACUUM accounts;
SELECT relfrozenxid, age(relfrozenxid) FROM pg_class WHERE relname = 'accounts';

-- @step T1 "VACUUM (FREEZE). every tuple gets the frozen bits, xmin stays as it was, the page is all-frozen, and relfrozenxid jumps to the present."
VACUUM (FREEZE) accounts;
SELECT relfrozenxid, age(relfrozenxid) FROM pg_class WHERE relname = 'accounts';
