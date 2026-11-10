-- @title city and country: the same two queries under no extended statistics and under each of the three kinds
-- @engine pglite
-- @db shop
-- @each

-- extended-statistics reads this file. for each kind of statistics object (none, dependencies,
-- ndistinct, mcv) it captures a WHERE on both columns and a GROUP BY on both: the estimate next
-- to the real count, then the plan with EXPLAIN ANALYZE. each object is dropped before the next.

-- @setup
CREATE FUNCTION est(q text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE j json;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || q INTO j;
  RETURN (j->0->'Plan'->>'Plan Rows')::bigint;
END $$;
CREATE FUNCTION act(q text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || q || ') AS s' INTO n;
  RETURN n;
END $$;

-- @step T1 "per-column statistics only: 35/2000 for Stockholm times 35/2000 for SE, times 2,000 rows. about 0.6, rounded up to 1."
SELECT est('SELECT * FROM customers WHERE city = ''Stockholm'' AND country = ''SE''') AS estimated, act('SELECT * FROM customers WHERE city = ''Stockholm'' AND country = ''SE''') AS actual;

-- @explain T1 "none, where."
SELECT * FROM customers WHERE city = 'Stockholm' AND country = 'SE';

-- @step T1 "per-column statistics only: the planner has no idea how many city and country pairs exist, and falls back to 200 groups."
SELECT est('SELECT city, country, count(*) FROM customers GROUP BY city, country') AS estimated, act('SELECT city, country, count(*) FROM customers GROUP BY city, country') AS actual;

-- @explain T1 "none, group."
SELECT city, country, count(*) FROM customers GROUP BY city, country;

-- @step T1 "CREATE STATISTICS (dependencies) on city and country, then ANALYZE."
CREATE STATISTICS cc (dependencies) ON city, country FROM customers;
ANALYZE customers;

-- @step T1 "dependencies: city determines country 97% of the time, so the country condition barely narrows Stockholm down."
SELECT est('SELECT * FROM customers WHERE city = ''Stockholm'' AND country = ''SE''') AS estimated, act('SELECT * FROM customers WHERE city = ''Stockholm'' AND country = ''SE''') AS actual;

-- @explain T1 "dependencies, where."
SELECT * FROM customers WHERE city = 'Stockholm' AND country = 'SE';

-- @step T1 "dependencies don't help count groups. still 200."
SELECT est('SELECT city, country, count(*) FROM customers GROUP BY city, country') AS estimated, act('SELECT city, country, count(*) FROM customers GROUP BY city, country') AS actual;

-- @explain T1 "dependencies, group."
SELECT city, country, count(*) FROM customers GROUP BY city, country;

-- @step T1 "drop it again."
DROP STATISTICS cc;

-- @step T1 "CREATE STATISTICS (ndistinct) on city and country, then ANALYZE."
CREATE STATISTICS cc (ndistinct) ON city, country FROM customers;
ANALYZE customers;

-- @step T1 "ndistinct doesn't help a WHERE: back to the multiplied estimate."
SELECT est('SELECT * FROM customers WHERE city = ''Stockholm'' AND country = ''SE''') AS estimated, act('SELECT * FROM customers WHERE city = ''Stockholm'' AND country = ''SE''') AS actual;

-- @explain T1 "ndistinct, where."
SELECT * FROM customers WHERE city = 'Stockholm' AND country = 'SE';

-- @step T1 "ndistinct: ANALYZE counted 41 distinct (city, country) pairs, and the estimate is exactly that."
SELECT est('SELECT city, country, count(*) FROM customers GROUP BY city, country') AS estimated, act('SELECT city, country, count(*) FROM customers GROUP BY city, country') AS actual;

-- @explain T1 "ndistinct, group."
SELECT city, country, count(*) FROM customers GROUP BY city, country;

-- @step T1 "drop it again."
DROP STATISTICS cc;

-- @step T1 "CREATE STATISTICS (mcv) on city and country, then ANALYZE."
CREATE STATISTICS cc (mcv) ON city, country FROM customers;
ANALYZE customers;

-- @step T1 "mcv: (Stockholm, SE) is in the list of most common pairs, with its exact frequency."
SELECT est('SELECT * FROM customers WHERE city = ''Stockholm'' AND country = ''SE''') AS estimated, act('SELECT * FROM customers WHERE city = ''Stockholm'' AND country = ''SE''') AS actual;

-- @explain T1 "mcv, where."
SELECT * FROM customers WHERE city = 'Stockholm' AND country = 'SE';

-- @step T1 "an MCV list of pairs doesn't give a group count either."
SELECT est('SELECT city, country, count(*) FROM customers GROUP BY city, country') AS estimated, act('SELECT city, country, count(*) FROM customers GROUP BY city, country') AS actual;

-- @explain T1 "mcv, group."
SELECT city, country, count(*) FROM customers GROUP BY city, country;

-- @step T1 "drop it again."
DROP STATISTICS cc;

-- @step T1 "an expression: no statistics for lower(city), so the default 0.005 of 2,000 rows."
SELECT est('SELECT * FROM customers WHERE lower(city) = ''paris''') AS estimated, act('SELECT * FROM customers WHERE lower(city) = ''paris''') AS actual;

-- @step T1 "statistics on the expression itself, no index needed."
CREATE STATISTICS city_lower ON (lower(city)) FROM customers;
ANALYZE customers;

-- @step T1 "now the planner knows how common paris is, in lower case."
SELECT est('SELECT * FROM customers WHERE lower(city) = ''paris''') AS estimated, act('SELECT * FROM customers WHERE lower(city) = ''paris''') AS actual;
