-- @title two sessions check for a sku, find nothing, and both insert it
-- @sessions T1 T2
-- @each xids locks heap(stock)

-- @setup
CREATE TABLE stock (sku text PRIMARY KEY, qty int NOT NULL);
INSERT INTO stock VALUES ('TEA-01', 10);
VACUUM stock;

-- @step T1 "T1 opens a transaction."
BEGIN;

-- @step T1 "T1 checks: is TEA-02 there? no rows. so the app decides to INSERT."
SELECT qty FROM stock WHERE sku = 'TEA-02';

-- @step T2 "T2 opens a transaction."
BEGIN;

-- @step T2 "T2 checks too. T1 hasn't inserted anything yet, so T2 also sees no rows, and also decides to INSERT."
SELECT qty FROM stock WHERE sku = 'TEA-02';

-- @step T1 "T1 inserts TEA-02."
INSERT INTO stock VALUES ('TEA-02', 5);

-- @step T2 blocks errors=23505 "T2 inserts TEA-02. the unique index has T1's uncommitted entry, so T2 waits to see whether T1 commits."
INSERT INTO stock VALUES ('TEA-02', 3);

-- @step T1 "T1 commits. T2 wakes up to a duplicate key error. its whole transaction is now aborted, and its delivery of 3 is lost unless the app catches the error and retries."
COMMIT;

-- @step T2 "T2 can only roll back."
ROLLBACK;

-- @step T2 "one row, qty 5. T2's 3 never arrived."
SELECT sku, qty FROM stock ORDER BY sku;
