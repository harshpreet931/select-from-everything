-- @title a real nbtree: 200 keys, packed 10% full so a small index has several leaves
-- @engine pglite
-- @each

-- b-plus-trees reads this file: the same shape as the lab (a root over a row of leaves),
-- but built by postgres. fillfactor 10 leaves room for about 40 int4 keys on each leaf,
-- so 200 keys make six leaves. the probe reads every page with bt_page_items.

-- @setup
CREATE TABLE t (id int);
INSERT INTO t SELECT generate_series(1, 200);

-- @step T1 +btree(t_id, items=6) "CREATE INDEX sorts the 200 keys and writes the leaves left to right, then the root above them."
CREATE INDEX t_id ON t (id) WITH (fillfactor = 10);

-- @step T1 +btree(t_id, items=6) "five more keys on the end: the rightmost leaf takes them, nothing splits."
INSERT INTO t SELECT generate_series(201, 205);
