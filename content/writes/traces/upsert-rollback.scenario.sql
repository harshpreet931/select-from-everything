-- @title two sessions upsert the same new sku, and the first one rolls back
-- @sessions T1 T2
-- @each xids locks heap(stock)

-- @setup
CREATE TABLE stock (sku text PRIMARY KEY, qty int NOT NULL);
INSERT INTO stock VALUES ('TEA-01', 10);
VACUUM stock;

-- @step T1 "T1 opens a transaction."
BEGIN;

-- @step T1 "T1 upserts TEA-02. no such row, so it inserts one, uncommitted."
INSERT INTO stock VALUES ('TEA-02', 5)
ON CONFLICT (sku) DO UPDATE SET qty = stock.qty + EXCLUDED.qty;

-- @step T2 blocks "T2 upserts TEA-02 too, finds T1's uncommitted entry in the unique index, and waits on T1's transaction id."
INSERT INTO stock VALUES ('TEA-02', 3)
ON CONFLICT (sku) DO UPDATE SET qty = stock.qty + EXCLUDED.qty;

-- @step T1 "T1 rolls back. T2 wakes up, finds no conflict after all, and inserts its own row."
ROLLBACK;

-- @step T2 "one row, qty 3: T2's delivery, and nothing of T1's. again no error."
SELECT sku, qty FROM stock ORDER BY sku;
