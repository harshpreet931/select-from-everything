-- @title three conditions that say the same thing, multiplied as if they didn't, and the nested loop that follows
-- @engine pglite
-- @db shop
-- @each

-- misestimates reads this file. tickets has 30,000 rows; each team works one queue in one
-- region, so team = 7 already implies queue = 7 and region = 7. step 0 adds the conditions one
-- at a time; steps 1-2 are the join the misestimate breaks; steps 3-6 the same join after
-- CREATE STATISTICS tells the planner the columns move together.

-- @setup
CREATE TABLE tickets (id int PRIMARY KEY, team int NOT NULL, queue int NOT NULL, region int NOT NULL, customer_id int NOT NULL REFERENCES customers);
INSERT INTO tickets SELECT i, i % 30, i % 30, i % 30, 1 + (i * 37) % 2000 FROM generate_series(1, 30000) AS i ORDER BY i;
CREATE INDEX orders_customer_id ON orders (customer_id);
ANALYZE tickets;
ANALYZE orders;
CREATE FUNCTION est(q text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE j json;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || q INTO j;
  RETURN (j->0->'Plan'->>'Plan Rows')::bigint;
END $$;

-- @step T1 "one condition, two, three: the estimate divides by 30 each time, the real count never moves."
SELECT q AS conditions,
       est('SELECT * FROM tickets WHERE ' || q) AS est,
       (SELECT count(*) FROM tickets WHERE team = 7) AS actual
FROM unnest(ARRAY['team = 7', 'team = 7 AND queue = 7', 'team = 7 AND queue = 7 AND region = 7']) WITH ORDINALITY AS t(q, k)
ORDER BY k;

-- @step T1 "the join: every order of every customer with a ticket in team 7's queue, in team 7's region."
SELECT count(*)
FROM tickets AS t
JOIN orders AS o ON o.customer_id = t.customer_id
WHERE t.team = 7 AND t.queue = 7 AND t.region = 7;
-- @explain T1 "the planner expects 1 ticket, so it picks a nested loop: one index probe into orders per ticket. it runs 1,000 times."
SELECT count(*)
FROM tickets AS t
JOIN orders AS o ON o.customer_id = t.customer_id
WHERE t.team = 7 AND t.queue = 7 AND t.region = 7;

-- @step T1 "tell the planner the three columns depend on each other."
CREATE STATISTICS tickets_team (dependencies) ON team, queue, region FROM tickets;
ANALYZE tickets;

-- @step T1 "the same join."
SELECT count(*)
FROM tickets AS t
JOIN orders AS o ON o.customer_id = t.customer_id
WHERE t.team = 7 AND t.queue = 7 AND t.region = 7;
-- @explain T1 "now it expects 1,000 tickets: sort them and merge with the index on orders, reading each page once."
SELECT count(*)
FROM tickets AS t
JOIN orders AS o ON o.customer_id = t.customer_id
WHERE t.team = 7 AND t.queue = 7 AND t.region = 7;
