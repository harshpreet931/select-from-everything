-- @title two sessions MERGE the same new sku at the same moment
-- @sessions T1 T2
-- @each xids locks heap(stock)

-- @setup
CREATE TABLE stock (sku text PRIMARY KEY, qty int NOT NULL);
INSERT INTO stock VALUES ('TEA-01', 10);
VACUUM stock;

-- @step T1 "T1 opens a transaction."
BEGIN;

-- @step T1 "T1 merges a delivery of TEA-02. no match, so WHEN NOT MATCHED inserts it. not committed yet."
MERGE INTO stock AS s
USING (VALUES ('TEA-02', 5)) AS d (sku, qty) ON s.sku = d.sku
WHEN MATCHED THEN UPDATE SET qty = s.qty + d.qty
WHEN NOT MATCHED THEN INSERT VALUES (d.sku, d.qty);

-- @step T2 blocks errors=23505 "T2 merges TEA-02 too. its join found no row (T1's isn't committed), so it goes for the INSERT, and the unique index makes it wait for T1."
MERGE INTO stock AS s
USING (VALUES ('TEA-02', 3)) AS d (sku, qty) ON s.sku = d.sku
WHEN MATCHED THEN UPDATE SET qty = s.qty + d.qty
WHEN NOT MATCHED THEN INSERT VALUES (d.sku, d.qty);

-- @step T1 "T1 commits. T2 wakes up to a duplicate key error. MERGE doesn't go back and try WHEN MATCHED instead."
COMMIT;

-- @step T2 "T2 can only roll back."
ROLLBACK;

-- @step T2 "qty 5. T2's delivery is lost unless the app retries."
SELECT sku, qty FROM stock ORDER BY sku;
