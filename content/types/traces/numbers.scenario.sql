-- @title the bits of four doubles, what each number type costs on disk, and ten 0.1s added up three ways
-- @engine pglite
-- @each

-- the float bits, the bytes bars and the sum switch on types/numbers read this.

-- @step T1 "four doubles as postgres stores them: float8send's 8 bytes, split into bits, and the exact decimal those bits hold, computed in numeric."
WITH v (n, label, x) AS (
  VALUES (1, '0.1', 0.1::float8), (2, '0.2', 0.2::float8), (3, '0.3', 0.3::float8), (4, '0.1 + 0.2', 0.1::float8 + 0.2::float8)
),
b AS (SELECT n, label, x, ('x' || encode(float8send(x), 'hex'))::bit(64) AS bits FROM v),
p AS (SELECT n, label, x, bits, bits::bigint AS i, ((bits::bigint >> 52) & 2047)::int AS e FROM b)
SELECT label, x AS shown, encode(float8send(x), 'hex') AS hex, bits::text AS bits, e - 1023 AS exponent,
       rtrim('0.' || lpad(((4503599627370496 + (i & 4503599627370495))::numeric * 5::numeric ^ (1075 - e))::text, 1075 - e, '0'), '0') AS exactly
FROM p
ORDER BY n;

-- @step T1 "one row with a value of every kind, stored in a table so each gets its on-disk header."
CREATE TABLE w (i2 smallint, i4 integer, i8 bigint, f8 float8, n1 numeric, n2 numeric, n3 numeric);
INSERT INTO w VALUES (1, 1, 1, 0.1, 1, 12345.67, 0.1000000000000000055511151231257827021181583404541015625);

-- @step T1 "bytes per value. the integers and floats are fixed; numeric grows with its digits."
SELECT t.label, t.bytes
FROM w
CROSS JOIN LATERAL (VALUES
  (1, 'smallint', pg_column_size(i2)),
  (2, 'integer', pg_column_size(i4)),
  (3, 'bigint', pg_column_size(i8)),
  (4, 'float8', pg_column_size(f8)),
  (5, 'numeric 1', pg_column_size(n1)),
  (6, 'numeric 12345.67', pg_column_size(n2)),
  (7, 'numeric, 55 digits', pg_column_size(n3))
) AS t (n, label, bytes)
ORDER BY t.n;

-- @step T1 "ten float4 0.1s: real has about 7 significant digits, and the error shows in the 8th."
SELECT sum(0.1::float4) AS total, sum(0.1::float4) = 1 AS is_one FROM generate_series(1, 10);

-- @step T1 "ten float8 0.1s: each one is a hair over 0.1, the additions round, and the total lands a hair under 1."
SELECT sum(0.1::float8) AS total, sum(0.1::float8) = 1 AS is_one FROM generate_series(1, 10);

-- @step T1 "ten numeric 0.1s: exact decimal arithmetic, exactly 1."
SELECT sum(0.1::numeric) AS total, sum(0.1::numeric) = 1 AS is_one FROM generate_series(1, 10);
