-- @title one list sorted under three collations, and five ways to compare without case, on a real server
-- @engine native
-- @each

-- the collation switch and the case-insensitive table on types/text-and-collation read this.
-- ICU's language collations and nondeterministic collations only work on a server: the browser
-- engine has ICU's root order and nothing else.

-- @setup
CREATE TABLE words (w text);
INSERT INTO words VALUES ('apple'), ('Banana'), ('cherry'), ('ost'), ('Öl'), ('zebra'), ('zoe'), ('Zoë'), ('Ångström');
CREATE EXTENSION citext;
CREATE COLLATION ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
CREATE COLLATION ai_ci (provider = icu, locale = 'und-u-ks-level1', deterministic = false);

-- @step T1 "C: byte order. every capital before every small letter, and anything accented after z."
SELECT w FROM words ORDER BY w COLLATE "C";

-- @step T1 "english: letters first, then accents, then case. Å is an A with a ring, Ö an O with dots, so they sort with A and O."
SELECT w FROM words ORDER BY w COLLATE "en-US-x-icu";

-- @step T1 "swedish: Å and Ö are letters of their own, after z. Ångström and Öl go to the end."
SELECT w FROM words ORDER BY w COLLATE "sv-SE-x-icu";

-- @step T1 "three pairs, five ways to compare them. this server's ctype is C, so lower() and citext only fold ASCII letters."
SELECT m.method, m.a AS "zoe, ZOE", m.b AS "Zoë, ZOË", m.c AS "zoe, Zoë"
FROM (VALUES
  (1, 'a = b',               'zoe' = 'ZOE',                   'Zoë' = 'ZOË',                   'zoe' = 'Zoë'),
  (2, 'lower(a) = lower(b)', lower('zoe') = lower('ZOE'),     lower('Zoë') = lower('ZOË'),     lower('zoe') = lower('Zoë')),
  (3, 'citext',              'zoe'::citext = 'ZOE'::citext,   'Zoë'::citext = 'ZOË'::citext,   'zoe'::citext = 'Zoë'::citext),
  (4, 'COLLATE ci',          'zoe' = 'ZOE' COLLATE ci,        'Zoë' = 'ZOË' COLLATE ci,        'zoe' = 'Zoë' COLLATE ci),
  (5, 'COLLATE ai_ci',       'zoe' = 'ZOE' COLLATE ai_ci,     'Zoë' = 'ZOË' COLLATE ai_ci,     'zoe' = 'Zoë' COLLATE ai_ci)
) AS m (n, method, a, b, c)
ORDER BY m.n;
