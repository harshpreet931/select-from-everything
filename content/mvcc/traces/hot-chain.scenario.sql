-- @title two HOT updates and one that isn't, on a nearly full page, then a read that prunes and a VACUUM
-- @sessions T1 T2
-- @each xids heap(items, 0) btree(items_pkey) btree(items_sku)

-- @setup
CREATE TABLE items (
  id   int PRIMARY KEY,
  sku  text NOT NULL,
  qty  int NOT NULL,
  note text
);
CREATE INDEX items_sku ON items (sku);
INSERT INTO items VALUES (1, 'A-1', 10, NULL), (2, 'A-2', 10, NULL);
INSERT INTO items SELECT g, 'F-' || g, 0, repeat('x', 1144) FROM generate_series(3, 8) AS g ORDER BY g;
VACUUM items;

-- @probe "the page as loaded: two small rows and six big ones. 952 bytes free."

-- @step T1 "change qty, a column no index covers. the new version fits on the same page, so the update is HOT: no index hears about it."
UPDATE items SET qty = qty - 1 WHERE id = 1;

-- @step T1 "again. now the chain is three versions long, and both indexes still have exactly one entry for row 1."
UPDATE items SET qty = qty - 1 WHERE id = 1;

-- @step T1 "change sku, which items_sku covers. same page, plenty of room, and still not HOT: both indexes get a new entry for row 2."
UPDATE items SET sku = 'B-2' WHERE id = 2;

-- @step T2 "a plain read of row 1. the page is nearly full and the old versions are dead to everyone, so the read prunes it on the way through."
SELECT qty FROM items WHERE id = 1;

-- @step obs "VACUUM. it removes the index entries that point at row 2's old version, so that line pointer can be freed too."
VACUUM items;
