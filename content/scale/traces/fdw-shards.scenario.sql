-- @title events hash-sharded on user_id across two postgres_fdw "shards", and what each query sends to them
-- @db events
-- @ext postgres_fdw
-- @each

-- sharding reads this file. a real postgres 18.6 with postgres_fdw: the parent table's two
-- partitions are foreign tables, and each "shard" is a schema on the same server reached through a
-- loopback connection (a real shard would be another machine; the plans are the same). plain
-- EXPLAIN (VERBOSE), so each Foreign Scan shows the Remote SQL it sends.

-- @setup
DO $$ BEGIN
  EXECUTE format('CREATE SERVER shard1 FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host %L, port %L, dbname %L)',
                 current_setting('unix_socket_directories'), current_setting('port'), current_database());
  EXECUTE format('CREATE SERVER shard2 FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host %L, port %L, dbname %L)',
                 current_setting('unix_socket_directories'), current_setting('port'), current_database());
END $$;
CREATE USER MAPPING FOR CURRENT_USER SERVER shard1 OPTIONS (user 'postgres');
CREATE USER MAPPING FOR CURRENT_USER SERVER shard2 OPTIONS (user 'postgres');
CREATE SCHEMA s1;
CREATE SCHEMA s2;
CREATE TABLE s1.events (LIKE events);
CREATE TABLE s2.events (LIKE events);
CREATE TABLE ev (LIKE events) PARTITION BY HASH (user_id);
CREATE FOREIGN TABLE ev_shard1 PARTITION OF ev FOR VALUES WITH (MODULUS 2, REMAINDER 0) SERVER shard1 OPTIONS (schema_name 's1', table_name 'events');
CREATE FOREIGN TABLE ev_shard2 PARTITION OF ev FOR VALUES WITH (MODULUS 2, REMAINDER 1) SERVER shard2 OPTIONS (schema_name 's2', table_name 'events');
INSERT INTO s1.events SELECT * FROM events WHERE satisfies_hash_partition('ev'::regclass, 2, 0, user_id) ORDER BY id;
INSERT INTO s2.events SELECT * FROM events WHERE satisfies_hash_partition('ev'::regclass, 2, 1, user_id) ORDER BY id;
CREATE INDEX ON s1.events (user_id);
CREATE INDEX ON s2.events (user_id);
ANALYZE s1.events;
ANALYZE s2.events;
ANALYZE ev;

-- @step T1 "how many rows each shard holds."
SELECT tableoid::regclass AS shard, count(*) AS events, count(DISTINCT user_id) AS users
FROM ev GROUP BY tableoid ORDER BY shard;

-- @step T1 "a query with the shard key goes to one shard, and the WHERE travels with it."
EXPLAIN (VERBOSE, COSTS OFF)
SELECT count(*) FROM ev WHERE user_id = 17;

-- @step T1 "without the shard key, every shard gets the query: scatter, then gather."
EXPLAIN (VERBOSE, COSTS OFF)
SELECT count(*) FROM ev WHERE kind = 'purchase';

-- @step T1 "grouped by the shard key, with partitionwise aggregation on: each shard runs the GROUP BY itself and sends back only its groups."
SET enable_partitionwise_aggregate = on;
EXPLAIN (VERBOSE, COSTS OFF)
SELECT user_id, count(*) FROM ev GROUP BY user_id;

-- @step T1 "a total across shards: each shard still ships its matching rows, and the counting happens here. postgres_fdw doesn't push partial aggregates down."
EXPLAIN (VERBOSE, COSTS OFF)
SELECT count(*) FROM ev WHERE kind = 'purchase';

-- @step T1 "the answers agree, however the work was split."
SELECT count(*) AS purchases FROM ev WHERE kind = 'purchase';
