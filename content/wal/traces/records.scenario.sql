-- @title four statements on lab's accounts and the WAL records each one wrote
-- @engine pglite
-- @db lab
-- @each wal

-- @setup
SELECT 1;

-- @step T1 "a new account. the heap insert carries a copy of page 0 (the first change since the dataset's checkpoint), the primary key gets a leaf entry, then the commit."
INSERT INTO accounts VALUES (4, 'dave', 10.00);

-- @step T1 "another one. the page is already logged since the checkpoint, so each record is just the change."
INSERT INTO accounts VALUES (5, 'erin', 20.00);

-- @step T1 "a balance changes. balance isn't indexed and the new version fits on the same page, so it's a HOT update: one heap record, no index record."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;

-- @step T1 "an id changes. id is the primary key, so this can't be HOT: a heap UPDATE and a new index entry."
UPDATE accounts SET id = 20 WHERE id = 2;
