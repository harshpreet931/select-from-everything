-- @label mvcc
-- @db lab
-- an UPDATE doesn't change a row in place: it writes a new version (a new ctid and xmin)
SELECT ctid, xmin, xmax, id, balance FROM accounts ORDER BY id;

UPDATE accounts SET balance = balance + 10 WHERE id = 1;

SELECT ctid, xmin, xmax, id, balance FROM accounts ORDER BY id;
