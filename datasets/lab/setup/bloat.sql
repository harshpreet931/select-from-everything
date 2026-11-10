-- setup=bloat: a table with half its rows deleted and a tenth updated, autovacuum off.
-- pages full of dead tuples for VACUUM, pg_visibility and pageinspect to find.
CREATE TABLE bloat (
  id      int PRIMARY KEY,
  payload text NOT NULL
) WITH (autovacuum_enabled = off);

INSERT INTO bloat (id, payload)
SELECT g, repeat('x', 80)
FROM generate_series(1, 2000) AS g
ORDER BY g;

DELETE FROM bloat WHERE id % 2 = 0;

UPDATE bloat SET payload = repeat('y', 80) WHERE id % 10 = 1;
