-- @title one leaf, filled until it splits: once at the right edge, once in the middle
-- @engine pglite
-- @each btree(e_id, items=6)

-- page-splits reads this file. even keys first, so there are gaps for odd ones later.
-- an int4 leaf holds 407 entries. the first split happens on the rightmost page (90/10),
-- the second in the middle of the tree (about 50/50).

-- @setup
CREATE TABLE e (id int);
CREATE INDEX e_id ON e (id);

-- @step T1 "407 even keys, 2 to 814, in ascending order: the only page is full, with 8 bytes to spare."
INSERT INTO e SELECT g * 2 FROM generate_series(1, 407) AS g;

-- @step T1 "one more key on the end. the root leaf splits: 366 keys stay on the left, the rest go to a new page, and a root appears above them."
INSERT INTO e VALUES (816);

-- @step T1 "forty odd keys, 1 to 79, all land on the left leaf, which fills up again."
INSERT INTO e SELECT g * 2 - 1 FROM generate_series(1, 40) AS g;

-- @step T1 "one more, 81, in the middle of a page that isn't the rightmost: this time it splits down the middle, and the new page goes between the two old ones."
INSERT INTO e VALUES (81);
