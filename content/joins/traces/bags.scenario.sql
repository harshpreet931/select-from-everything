-- @title two baskets with duplicates and a NULL, combined six ways
-- @engine pglite
-- @each

-- the basket figure on set-operations reads these: both baskets, then UNION, INTERSECT and
-- EXCEPT, each without and with ALL. every result is the real query's rows.

-- @setup
CREATE TABLE ada (item text);
INSERT INTO ada VALUES ('kettle'), ('kettle'), ('kettle'), ('whisk'), (NULL);
CREATE TABLE sean (item text);
INSERT INTO sean VALUES ('kettle'), ('kettle'), ('atlas'), (NULL);

-- @step T1 "Ada's basket."
SELECT item FROM ada ORDER BY item NULLS LAST;

-- @step T1 "Sean's basket."
SELECT item FROM sean ORDER BY item NULLS LAST;

-- @step T1 "UNION: every distinct item from either basket, once. the two NULLs count as the same item."
SELECT item FROM ada UNION SELECT item FROM sean ORDER BY item NULLS LAST;

-- @step T1 "UNION ALL: both baskets poured into one, nothing removed. 5 + 4 = 9 rows."
SELECT item FROM ada UNION ALL SELECT item FROM sean ORDER BY item NULLS LAST;

-- @step T1 "INTERSECT: the distinct items in both baskets: kettle, and NULL, which set operations treat as equal to NULL."
SELECT item FROM ada INTERSECT SELECT item FROM sean ORDER BY item NULLS LAST;

-- @step T1 "INTERSECT ALL: as many copies as both baskets have: Ada has 3 kettles, Sean 2, so 2 come out."
SELECT item FROM ada INTERSECT ALL SELECT item FROM sean ORDER BY item NULLS LAST;

-- @step T1 "EXCEPT: distinct items in Ada's basket and not in Sean's. only the whisk."
SELECT item FROM ada EXCEPT SELECT item FROM sean ORDER BY item NULLS LAST;

-- @step T1 "EXCEPT ALL: each of Sean's copies cancels one of Ada's. 3 kettles minus 2 leaves 1, and the whisk."
SELECT item FROM ada EXCEPT ALL SELECT item FROM sean ORDER BY item NULLS LAST;
