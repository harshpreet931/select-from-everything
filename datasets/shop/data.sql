-- shop data. deterministic: every generated value is a hash of the row number (gen.pick, gen.u),
-- never random() and never now(), so the same rows come out on PGlite and on a real server.
-- only exact arithmetic (integers, numeric, float * and sqrt): no pow(), whose last bit can
-- differ between C libraries. every INSERT ... SELECT has an ORDER BY, so the physical row
-- order is the same everywhere too.

CREATE SCHEMA gen;

-- uniform int in [0, m). never abs(): abs(-2147483648) overflows int4
CREATE FUNCTION gen.pick(i int, salt int, m int) RETURNS int
  LANGUAGE sql IMMUTABLE STRICT
  RETURN ((hashint4(i * 977 + salt)::bigint + 2147483648) % m)::int;

-- uniform float8 in [0, 1)
CREATE FUNCTION gen.u(i int, salt int) RETURNS float8
  LANGUAGE sql IMMUTABLE STRICT
  RETURN (hashint4(i * 977 + salt)::bigint + 2147483648) / 4294967296.0;

CREATE FUNCTION gen.first_name(i int) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT
  RETURN (ARRAY['Liam','Olivia','Noah','Emma','Mateo','Amelia','Lucas','Sofia','Arjun','Aisha',
                'Kenji','Yuna','Omar','Leila','Diego','Valentina','Kofi','Ama','Ivan','Elena',
                'Chen','Mei','Tariq','Fatima','Lars','Ingrid','Rahul','Ananya','Jonas','Clara',
                'Hugo','Lea','Kwame','Zara','Mateus','Bianca','Felix','Nora','Ravi','Sana'])[1 + gen.pick(i, 1, 40)];

CREATE FUNCTION gen.last_name(i int) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT
  RETURN (ARRAY['Smith','Garcia','Kim','Nguyen','Patel','Mueller','Rossi','Silva','Cohen','Okafor',
                'Tanaka','Novak','Dubois','Jensen','Kowalski','Haddad','Mensah','Petrov','Costa','Larsen',
                'Singh','Wong','Ahmed','Moreau','Schmidt','Romano','Santos','Lopez','Hansen','Yilmaz',
                'Sato','Park','Mehta','Fischer','Bianchi','Oliveira','Murphy','Kelly','Reyes','Ali'])[1 + gen.pick(i, 2, 40)];

-- most popular first: customers are drawn with a skew toward the top of this list
CREATE TABLE gen.cities (n int PRIMARY KEY, city text NOT NULL, country text NOT NULL);
INSERT INTO gen.cities VALUES
  (1, 'New York', 'US'), (2, 'London', 'GB'), (3, 'Berlin', 'DE'), (4, 'Mumbai', 'IN'),
  (5, 'Chicago', 'US'), (6, 'Manchester', 'GB'), (7, 'Munich', 'DE'), (8, 'Bengaluru', 'IN'),
  (9, 'Austin', 'US'), (10, 'Paris', 'FR'), (11, 'Toronto', 'CA'), (12, 'Madrid', 'ES'),
  (13, 'Amsterdam', 'NL'), (14, 'Sydney', 'AU'), (15, 'Hamburg', 'DE'), (16, 'Delhi', 'IN'),
  (17, 'Seattle', 'US'), (18, 'Lisbon', 'PT'), (19, 'Dublin', 'IE'), (20, 'Stockholm', 'SE'),
  (21, 'Lagos', 'NG'), (22, 'Tokyo', 'JP'), (23, 'Seoul', 'KR'), (24, 'Mexico City', 'MX');

-- customers: 1 to 12 and 42 by hand (each one an edge case), the rest generated.
--   1 Maya Chen     one cancelled order with no items (order 1)
--   2 Grace Okafor  NULL email
--   3, 9 Sam Lee    same name, different people
--   4, 5 Zoë/Zoe Martin  emails equal only case-insensitively, so UNIQUE allows both
--   6 José Silva    NULL city
--   7 Ming Li       never orders
--   8 Sean O'Neil   an apostrophe, for quoting
--  10 Null          the string 'Null', not NULL
--  11 Ana Lima      city '' (not NULL), and a second NULL email: UNIQUE allows many NULLs
--  12 Ravi Kumar    signed up 2026-03-29 01:30 UTC, the night the EU clocks change
--  42 Ada Lovelace  the customer every "WHERE id = 42" finds
INSERT INTO customers (id, name, email, city, country, created_at)
SELECT id, name, email, city, country, created_at
FROM (
  SELECT * FROM (VALUES
    (1, 'Maya Chen', 'maya.chen@example.com', 'San Francisco', 'US', timestamptz '2024-01-01 09:12:00+00'),
    (2, 'Grace Okafor', NULL, 'Lagos', 'NG', timestamptz '2024-01-02 14:40:00+00'),
    (3, 'Sam Lee', 'sam.lee@example.com', 'Toronto', 'CA', timestamptz '2024-01-03 08:05:00+00'),
    (4, 'Zoë Martin', 'Zoe.Martin@Example.com', 'Paris', 'FR', timestamptz '2024-01-03 19:30:00+00'),
    (5, 'Zoe Martin', 'zoe.martin@example.com', 'Lyon', 'FR', timestamptz '2024-01-04 11:11:00+00'),
    (6, 'José Silva', 'jose.silva@example.com', NULL, 'BR', timestamptz '2024-01-05 16:45:00+00'),
    (7, 'Ming Li', 'ming.li@example.com', 'Singapore', 'SG', timestamptz '2024-01-06 07:20:00+00'),
    (8, 'Sean O''Neil', 'sean.oneil@example.com', 'Dublin', 'IE', timestamptz '2024-01-07 21:02:00+00'),
    (9, 'Sam Lee', 'samlee.seoul@example.com', 'Seoul', 'KR', timestamptz '2024-01-08 03:33:00+00'),
    (10, 'Null', 'null@example.com', 'Berlin', 'DE', timestamptz '2024-01-08 12:00:00+00'),
    (11, 'Ana Lima', NULL, '', 'PT', timestamptz '2024-01-09 10:10:00+00'),
    (12, 'Ravi Kumar', 'ravi.kumar@example.com', 'Bengaluru', 'IN', timestamptz '2026-03-29 01:30:00+00'),
    (42, 'Ada Lovelace', 'ada@example.com', 'London', 'GB', timestamptz '2024-01-11 10:15:00+00')
  ) AS h (id, name, email, city, country, created_at)
  UNION ALL
  SELECT i,
         f || ' ' || l,
         CASE WHEN gen.pick(i, 3, 100) < 2 THEN NULL ELSE lower(f) || '.' || lower(l) || i || '@example.com' END,
         CASE WHEN gen.pick(i, 4, 1000) < 25 THEN NULL ELSE c.city END,
         c.country,
         timestamptz '2024-01-01 00:00:00+00' + i * interval '6 hours' + gen.pick(i, 5, 360) * interval '1 minute'
  FROM generate_series(13, 2000) AS i
  CROSS JOIN LATERAL (SELECT gen.first_name(i) AS f, gen.last_name(i) AS l, gen.u(i, 6) AS u) AS g
  JOIN gen.cities AS c ON c.n = 1 + floor(24 * g.u * g.u)::int
  WHERE i <> 42
) AS x
ORDER BY id;

-- products: 1 to 8 and 200 by hand.
--   2  attrs {"color": null}: a json null, not a missing key and not SQL NULL
--   3  no color key at all, and empty tags
--   4  price 0.00
--   5  a 6 KB description that compresses well (TOAST)
--   6  a 3 KB description of md5 hex that doesn't
--   7  NULL category (100 and 150 too: three NULLs, one GROUP BY bucket)
--   8  discontinued (so is every generated id divisible by 17: 12 in all)
-- 200  the left-handed teapot. nobody has ever ordered it.
CREATE TABLE gen.nouns (category text, n int, noun text, PRIMARY KEY (category, n));
INSERT INTO gen.nouns VALUES
  ('kitchen', 0, 'whisk'), ('kitchen', 1, 'kettle'), ('kitchen', 2, 'cutting board'), ('kitchen', 3, 'saucepan'), ('kitchen', 4, 'grater'),
  ('garden', 0, 'trowel'), ('garden', 1, 'watering can'), ('garden', 2, 'planter'), ('garden', 3, 'pruner'), ('garden', 4, 'seed tray'),
  ('books', 0, 'notebook'), ('books', 1, 'atlas'), ('books', 2, 'cookbook'), ('books', 3, 'novel'), ('books', 4, 'field guide'),
  ('toys', 0, 'kite'), ('toys', 1, 'puzzle'), ('toys', 2, 'yo-yo'), ('toys', 3, 'robot'), ('toys', 4, 'marble run'),
  ('office', 0, 'stapler'), ('office', 1, 'desk lamp'), ('office', 2, 'pen set'), ('office', 3, 'binder'), ('office', 4, 'monitor stand'),
  ('audio', 0, 'speaker'), ('audio', 1, 'earbuds'), ('audio', 2, 'turntable'), ('audio', 3, 'microphone'), ('audio', 4, 'radio'),
  ('outdoor', 0, 'tent'), ('outdoor', 1, 'lantern'), ('outdoor', 2, 'hammock'), ('outdoor', 3, 'water bottle'), ('outdoor', 4, 'compass'),
  ('bath', 0, 'towel'), ('bath', 1, 'soap dish'), ('bath', 2, 'bath mat'), ('bath', 3, 'loofah'), ('bath', 4, 'shower caddy'),
  ('pets', 0, 'leash'), ('pets', 1, 'chew toy'), ('pets', 2, 'food bowl'), ('pets', 3, 'pet bed'), ('pets', 4, 'brush'),
  ('games', 0, 'chess set'), ('games', 1, 'card deck'), ('games', 2, 'dice tower'), ('games', 3, 'board game'), ('games', 4, 'go board');

INSERT INTO products (id, sku, name, category, price, tags, attrs, description, discontinued)
SELECT id, sku, name, category, price, tags, attrs, description, discontinued
FROM (
  SELECT * FROM (VALUES
    (1, 'KIT-0001', 'chef''s knife', 'kitchen', 49.00, ARRAY['steel', 'sharp'], jsonb '{"color": "black", "weight_g": 210}',
        'a 20 cm knife that holds its edge.', false),
    (2, 'KIT-0002', 'cast iron pan', 'kitchen', 39.50, ARRAY['iron'], jsonb '{"color": null, "weight_g": 2300}',
        'heavy, slow to heat, lasts forever.', false),
    (3, 'BOO-0003', 'the art of sql', 'books', 32.00, ARRAY[]::text[], jsonb '{"pages": 412}',
        'a book about the language this book is about.', false),
    (4, 'OFF-0004', 'paper clips, free sample', 'office', 0.00, ARRAY['free'], jsonb '{"color": "silver", "weight_g": 40}',
        NULL, false),
    (5, 'AUD-0005', 'studio headphones', 'audio', 129.99, ARRAY['wired', 'closed-back'], jsonb '{"color": "black", "weight_g": 280}',
        repeat('quiet room, warm sound, long cable. ', 170), false),
    (6, 'GAR-0006', 'hose reel', 'garden', 54.25, ARRAY['steel'], jsonb '{"color": "green", "weight_g": 4100}',
        (SELECT string_agg(md5('hose reel ' || g), '' ORDER BY g) FROM generate_series(1, 94) AS g), false),
    (7, 'TOY-0007', 'wooden train', NULL, 24.00, ARRAY['wood', 'kids'], jsonb '{"color": "red", "weight_g": 650}',
        'six cars and a bridge.', false),
    (8, 'PET-0008', 'cat tree', 'pets', 89.00, ARRAY[]::text[], jsonb '{"color": "grey", "weight_g": 9000}',
        'tall enough for one cat, not two.', true),
    (200, 'KIT-0200', 'left-handed teapot', 'kitchen', 19.99, ARRAY['ceramic'], jsonb '{"color": "white", "weight_g": 700}',
        'pours the other way.', false)
  ) AS h (id, sku, name, category, price, tags, attrs, description, discontinued)
  UNION ALL
  SELECT i,
         coalesce(upper(left(c.category, 3)), 'MSC') || '-' || lpad(i::text, 4, '0'),
         a.adj || ' ' || n.noun,
         c.category,
         (299 + gen.pick(i, 22, 19701))::numeric / 100,
         CASE gen.pick(i, 23, 6)
           WHEN 0 THEN ARRAY[]::text[]
           WHEN 1 THEN ARRAY['sale']
           WHEN 2 THEN ARRAY['new']
           WHEN 3 THEN ARRAY['eco', 'new']
           ELSE ARRAY[n.category]
         END,
         jsonb_build_object(
           'color', (ARRAY['black', 'white', 'red', 'blue', 'green', 'grey', 'yellow', 'brown'])[1 + gen.pick(i, 25, 8)],
           'weight_g', 50 + gen.pick(i, 26, 2000)),
         CASE WHEN gen.pick(i, 27, 10) = 0 THEN NULL ELSE 'a ' || a.adj || ' ' || n.noun || ' from the ' || n.category || ' shelf.' END,
         i % 17 = 0
  FROM generate_series(9, 199) AS i
  CROSS JOIN LATERAL (SELECT (ARRAY['kitchen', 'garden', 'books', 'toys', 'office', 'audio', 'outdoor', 'bath', 'pets', 'games'])[1 + gen.pick(i, 21, 10)] AS category) AS k
  CROSS JOIN LATERAL (SELECT CASE WHEN i IN (100, 150) THEN NULL ELSE k.category END AS category) AS c
  CROSS JOIN LATERAL (SELECT (ARRAY['small', 'large', 'classic', 'compact', 'deluxe', 'folding', 'travel', 'heavy', 'bamboo', 'steel',
                                    'linen', 'cotton', 'retro', 'quiet', 'smart', 'mini', 'family', 'pro', 'basic', 'spare'])[1 + gen.pick(i, 24, 20)] AS adj) AS a
  JOIN gen.nouns AS n ON n.category = k.category AND n.n = gen.pick(i, 28, 5)
) AS x
ORDER BY id;

-- orders: one every 52 minutes (plus jitter) from 2025-07-01. old ones delivered, recent ones
-- placed or paid; about 3% cancelled and 1% refunded. customers drawn with a skew (u^1.5), so a
-- tail of customers never orders.
INSERT INTO orders (id, customer_id, status, ordered_at, shipped_at)
SELECT i,
       e.cust,
       s.status,
       a.at,
       CASE WHEN s.status IN ('shipped', 'delivered', 'refunded') THEN a.at + (2 + gen.pick(i, 34, 70)) * interval '1 hour' END
FROM generate_series(1, 10000) AS i
CROSS JOIN LATERAL (SELECT timestamptz '2025-07-01 00:00:00+00' + i * interval '52 minutes' + gen.pick(i, 31, 52) * interval '1 minute' AS at,
                           gen.u(i, 35) AS u) AS a
CROSS JOIN LATERAL (SELECT 1 + floor(2000 * a.u * sqrt(a.u))::int AS c) AS d
CROSS JOIN LATERAL (SELECT CASE
                             WHEN i = 1 THEN 1
                             WHEN d.c = 7 THEN 1999
                             WHEN d.c = 12 AND a.at < timestamptz '2026-03-29 01:30:00+00' THEN 13
                             ELSE d.c
                           END AS cust) AS e
CROSS JOIN LATERAL (SELECT CASE
                             WHEN i = 1 THEN 'cancelled'
                             WHEN gen.pick(i, 32, 100) < 3 THEN 'cancelled'
                             WHEN gen.pick(i, 32, 100) = 3 THEN 'refunded'
                             WHEN i + gen.pick(i, 33, 80) > 9990 THEN 'placed'
                             WHEN i + gen.pick(i, 33, 80) > 9930 THEN 'paid'
                             WHEN i + gen.pick(i, 33, 80) > 9800 THEN 'shipped'
                             ELSE 'delivered'
                           END AS status) AS s
ORDER BY i;

-- order_items: 1 to 4 lines per order, none for about 30 cancelled orders. products 1 to 199
-- skewed (u^2) so a few are bestsellers; 200 never appears. unit_price is the price at order
-- time, which differs from today's price for about 2% of lines.
INSERT INTO order_items (order_id, line_no, product_id, qty, unit_price)
SELECT o.id,
       l.n,
       p.id,
       1 + floor(5 * q.v * q.v * q.v)::int,
       CASE WHEN gen.pick(o.id * 4 + l.n, 39, 100) < 2 THEN round(p.price * 0.85, 2) ELSE p.price END
FROM orders AS o
CROSS JOIN LATERAL generate_series(1, CASE
                                        WHEN o.status = 'cancelled' AND (o.id = 1 OR gen.pick(o.id, 36, 10) = 0) THEN 0
                                        ELSE 1 + gen.pick(o.id, 13, 4)
                                      END) AS l (n)
CROSS JOIN LATERAL (SELECT gen.u(o.id * 4 + l.n, 37) AS u, gen.u(o.id * 4 + l.n, 38) AS v) AS q
JOIN products AS p ON p.id = 1 + floor(199 * q.u * q.u)::int
ORDER BY o.id, l.n;

-- the next INSERT without an id continues after the data
ALTER TABLE customers ALTER COLUMN id RESTART WITH 2001;
ALTER TABLE products ALTER COLUMN id RESTART WITH 201;
ALTER TABLE orders ALTER COLUMN id RESTART WITH 10001;

DROP SCHEMA gen CASCADE;
