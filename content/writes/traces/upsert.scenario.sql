-- @title a stock table and every way an insert can meet an existing key
-- @engine pglite
-- @each

-- the stepper on writes/upsert reads these, one statement at a time on one small table.

-- @step T1 "a stock table keyed by sku."
CREATE TABLE stock (
  sku  text PRIMARY KEY,
  qty  int  NOT NULL,
  seen date NOT NULL
);

-- @step T1 "two teas in stock."
INSERT INTO stock VALUES ('TEA-01', 10, '2026-03-01'), ('TEA-02', 5, '2026-03-01');

-- @step T1 "the table."
SELECT sku, qty, seen FROM stock ORDER BY sku;

-- @step T1 errors=23505 "a plain INSERT of a sku that's already there: the primary key says no, and the whole statement fails."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-02');

-- @step T1 "nothing changed."
SELECT sku, qty, seen FROM stock ORDER BY sku;

-- @step T1 "DO NOTHING: TEA-01 conflicts and is skipped, TEA-03 is new and goes in. INSERT 0 1."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-02'), ('TEA-03', 7, '2026-03-02')
ON CONFLICT (sku) DO NOTHING;

-- @step T1 "the table after it."
SELECT sku, qty, seen FROM stock ORDER BY sku;

-- @step T1 "DO UPDATE: TEA-01 exists, so its row is updated with EXCLUDED, the row you tried to insert. TEA-04 is new and inserted. INSERT 0 2 counts both."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-03'), ('TEA-04', 12, '2026-03-03')
ON CONFLICT (sku) DO UPDATE
SET qty = stock.qty + EXCLUDED.qty, seen = EXCLUDED.seen;

-- @step T1 "the table after it."
SELECT sku, qty, seen FROM stock ORDER BY sku;

-- @step T1 "a WHERE on DO UPDATE: this delivery note is older than what we already have, so the update is skipped. INSERT 0 0."
INSERT INTO stock VALUES ('TEA-02', 99, '2026-02-01')
ON CONFLICT (sku) DO UPDATE
SET qty = EXCLUDED.qty, seen = EXCLUDED.seen
WHERE EXCLUDED.seen > stock.seen;

-- @step T1 "the table after it: TEA-02 kept its newer row."
SELECT sku, qty, seen FROM stock ORDER BY sku;

-- @step T1 errors=21000 "the same sku twice in one statement. the second would update the row the first just wrote, and postgres refuses."
INSERT INTO stock VALUES ('TEA-02', 1, '2026-03-04'), ('TEA-02', 2, '2026-03-04')
ON CONFLICT (sku) DO UPDATE
SET qty = stock.qty + EXCLUDED.qty, seen = EXCLUDED.seen;

-- @step T1 "nothing changed."
SELECT sku, qty, seen FROM stock ORDER BY sku;

-- the arbiter switch: every conflict target with both actions, each in a transaction of its own.

-- @step T1 "a transaction to undo it in."
BEGIN;

-- @step T1 "(sku) names the primary key's column, so the primary key's index is the arbiter. TEA-01 conflicts and is skipped: no rows back."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-05')
ON CONFLICT (sku) DO NOTHING
RETURNING sku, qty;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "a transaction to undo it in."
BEGIN;

-- @step T1 "(sku) finds the primary key's index, TEA-01 conflicts, and the existing row is updated: 13 + 3."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-05')
ON CONFLICT (sku) DO UPDATE SET qty = stock.qty + EXCLUDED.qty
RETURNING sku, qty;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "a transaction to undo it in."
BEGIN;

-- @step T1 "naming the constraint picks the same index, without listing its columns."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-05')
ON CONFLICT ON CONSTRAINT stock_pkey DO NOTHING
RETURNING sku, qty;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "a transaction to undo it in."
BEGIN;

-- @step T1 "the same update, the arbiter named by constraint."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-05')
ON CONFLICT ON CONSTRAINT stock_pkey DO UPDATE SET qty = stock.qty + EXCLUDED.qty
RETURNING sku, qty;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "a transaction to undo it in."
BEGIN;

-- @step T1 errors=42P10 "no unique index on (qty), so there's nothing to arbitrate with, and postgres refuses before inserting anything."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-05')
ON CONFLICT (qty) DO NOTHING
RETURNING sku, qty;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "a transaction to undo it in."
BEGIN;

-- @step T1 errors=42P10 "the same refusal: a conflict target must match a unique index or constraint."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-05')
ON CONFLICT (qty) DO UPDATE SET qty = stock.qty + EXCLUDED.qty
RETURNING sku, qty;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "a transaction to undo it in."
BEGIN;

-- @step T1 "DO NOTHING without a target skips a conflict on any unique index the table has."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-05')
ON CONFLICT DO NOTHING
RETURNING sku, qty;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "a transaction to undo it in."
BEGIN;

-- @step T1 errors=42601 "DO UPDATE without a target is refused: postgres needs to know which conflict it's updating for."
INSERT INTO stock VALUES ('TEA-01', 3, '2026-03-05')
ON CONFLICT DO UPDATE SET qty = stock.qty + EXCLUDED.qty
RETURNING sku, qty;

-- @step T1 "undo."
ROLLBACK;
