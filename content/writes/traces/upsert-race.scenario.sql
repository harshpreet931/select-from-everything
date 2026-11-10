-- @title two sessions upsert the same new sku at the same moment
-- @sessions T1 T2
-- @each xids locks heap(stock)

-- @setup
CREATE TABLE stock (sku text PRIMARY KEY, qty int NOT NULL);
INSERT INTO stock VALUES ('TEA-01', 10);
VACUUM stock;

-- @step T1 "T1 opens a transaction."
BEGIN;

-- @step T1 "T1 upserts TEA-02. there's no such row, so it inserts one. not committed yet, so nobody else can see it."
INSERT INTO stock VALUES ('TEA-02', 5)
ON CONFLICT (sku) DO UPDATE SET qty = stock.qty + EXCLUDED.qty;

-- @step T2 blocks "T2 upserts TEA-02 too. the unique index already holds T1's entry for it, and T1 hasn't decided yet, so T2 waits on T1's transaction id."
INSERT INTO stock VALUES ('TEA-02', 3)
ON CONFLICT (sku) DO UPDATE SET qty = stock.qty + EXCLUDED.qty;

-- @step T1 "T1 commits. T2 wakes up, now sees a committed conflicting row, and takes the DO UPDATE path: 5 + 3."
COMMIT;

-- @step T2 "one row, qty 8. both deliveries counted, no error, no retry."
SELECT sku, qty FROM stock ORDER BY sku;
