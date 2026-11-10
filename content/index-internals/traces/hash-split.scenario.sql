-- @title a hash index filled until a bucket splits, then skewed until a bucket overflows
-- @engine pglite
-- @each

-- hash-indexes reads this file. VACUUM first so CREATE INDEX sees an empty table and starts
-- with two buckets, and fillfactor 10 makes ffactor 40: a split every 40 tuples. then 600
-- copies of one key, which all hash to the same bucket no matter how many buckets there are.

-- @setup
CREATE TABLE h (id int);
VACUUM h;
CREATE INDEX h_id ON h USING hash (id) WITH (fillfactor = 10);

-- @probe +hash(h_id) "an empty hash index: page 0 is the metapage, then two bucket pages and a bitmap page."

-- @step T1 +hash(h_id) "80 keys: 40 per bucket on average, the most the index allows before it splits."
INSERT INTO h SELECT generate_series(1, 80);

-- @step T1 +hash(h_id) "the 81st key tips it over: bucket 2 appears, and only bucket 0's tuples are rehashed into it."
INSERT INTO h VALUES (81);

-- @step T1 +hash(h_id) "600 copies of 42. they keep the split counter running, but splits can't separate equal hashes: 42's bucket chains overflow pages."
INSERT INTO h SELECT 42 FROM generate_series(1, 600);
