-- bank data.
--   1 alice 100.00, 2 bob 100.00: in no transfer, so alice + bob = 200.00 is the invariant
--     every isolation figure checks
--   3 carol 0.00: the first withdrawal hits the CHECK
--   4 dave 1,000,000.00
--   5 to 1000: opening balance 1,000 to 5,000, transfers of 1 to 50 among themselves
-- balance = opening_balance + in - out, computed before the insert (no UPDATE, no dead rows).

CREATE SCHEMA gen;
CREATE FUNCTION gen.pick(i int, salt int, m int) RETURNS int
  LANGUAGE sql IMMUTABLE STRICT
  RETURN ((hashint4(i * 977 + salt)::bigint + 2147483648) % m)::int;

CREATE VIEW gen.transfers AS
SELECT i AS id,
       f.from_id,
       5 + (f.from_id - 5 + 1 + gen.pick(i, 65, 995)) % 996 AS to_id,
       (100 + gen.pick(i, 63, 4901))::numeric / 100 AS amount,
       timestamptz '2025-01-01 00:00:00+00' + i * interval '26 minutes' + gen.pick(i, 66, 26) * interval '1 minute' AS sent_at
FROM generate_series(1, 20000) AS i
CROSS JOIN LATERAL (SELECT 5 + gen.pick(i, 64, 996) AS from_id) AS f;

INSERT INTO accounts (id, owner, opening_balance, balance, currency, version, opened_at)
WITH flows AS (
  SELECT id, sum(delta) AS net
  FROM (SELECT to_id AS id, amount AS delta FROM gen.transfers
        UNION ALL
        SELECT from_id, -amount FROM gen.transfers) AS d
  GROUP BY id
),
generated AS (
  SELECT i AS id,
         (ARRAY['Liam','Olivia','Noah','Emma','Mateo','Amelia','Lucas','Sofia','Arjun','Aisha',
                'Kenji','Yuna','Omar','Leila','Diego','Valentina','Kofi','Ama','Ivan','Elena'])[1 + gen.pick(i, 67, 20)]
           || ' ' ||
         (ARRAY['Smith','Garcia','Kim','Nguyen','Patel','Mueller','Rossi','Silva','Cohen','Okafor',
                'Tanaka','Novak','Dubois','Jensen','Kowalski','Haddad','Mensah','Petrov','Costa','Larsen'])[1 + gen.pick(i, 68, 20)] AS owner,
         (100000 + gen.pick(i, 61, 400001))::numeric / 100 AS opening_balance,
         CASE WHEN gen.pick(i, 69, 100) < 90 THEN 'EUR' WHEN gen.pick(i, 69, 100) < 97 THEN 'USD' ELSE 'GBP' END AS currency,
         timestamptz '2023-01-01 00:00:00+00' + i * interval '13 hours' AS opened_at
  FROM generate_series(5, 1000) AS i
)
SELECT id, owner, opening_balance, opening_balance + coalesce(net, 0), currency, 0, opened_at
FROM (
  SELECT * FROM (VALUES
    (1, 'alice', 100.00, 'EUR', timestamptz '2023-01-01 09:00:00+00'),
    (2, 'bob', 100.00, 'EUR', timestamptz '2023-01-01 09:05:00+00'),
    (3, 'carol', 0.00, 'EUR', timestamptz '2023-01-01 09:10:00+00'),
    (4, 'dave', 1000000.00, 'EUR', timestamptz '2023-01-01 09:15:00+00')
  ) AS h (id, owner, opening_balance, currency, opened_at)
  UNION ALL
  SELECT id, owner, opening_balance, currency, opened_at FROM generated
) AS a
LEFT JOIN flows USING (id)
ORDER BY id;

INSERT INTO transfers (id, from_id, to_id, amount, sent_at)
SELECT id, from_id, to_id, amount, sent_at FROM gen.transfers ORDER BY id;

ALTER TABLE transfers ALTER COLUMN id RESTART WITH 20001;

DROP SCHEMA gen CASCADE;
