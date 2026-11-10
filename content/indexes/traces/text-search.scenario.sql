-- @title from a sentence to lexemes, from lexemes to rows, and a GIN index over 20,000 reviews
-- @engine pglite
-- @db shop
-- @each

-- text-search reads this file. reviews is generated from product names and a list of phrases,
-- deterministically (hashint4 of the row number), so every engine builds the same 20,000 rows.

-- @setup
CREATE TABLE reviews (id int PRIMARY KEY, product_id int NOT NULL, body text NOT NULL);
INSERT INTO reviews
SELECT i, p.id,
       'the ' || p.name || ' ' || (ARRAY['arrived quickly and works well', 'broke after a week', 'is smaller than it looks',
         'is great value for the price', 'has a handle that wobbles', 'pours the wrong way', 'stopped working after a month',
         'is exactly as described', 'is too heavy to carry', 'makes a terrible noise', 'was a gift and they loved it',
         'feels cheap but does the job'])[1 + ((hashint4(i)::bigint + 2147483648) % 12)::int]
FROM generate_series(1, 20000) AS i
JOIN products AS p ON p.id = 1 + (i * 37) % 199
ORDER BY i;
ALTER TABLE reviews ADD COLUMN doc tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED;
CREATE INDEX reviews_doc ON reviews USING gin (doc);
VACUUM ANALYZE reviews;

-- @step T1 "how the english configuration takes a sentence apart: each token, the dictionary that handled it, and the lexeme it became."
SELECT alias, token, lexemes
FROM ts_debug('english', 'The left-handed teapots pour the other way')
WHERE alias <> 'blank';

-- @step T1 "an inverted index, by hand: every lexeme in product names, and the products that contain it."
SELECT lexeme, count(*) AS products, array_agg(id ORDER BY id) AS ids
FROM products, unnest(to_tsvector('english', name)) AS u
WHERE lexeme IN ('steel', 'teapot', 'whisk', 'pan', 'knife', 'speaker')
GROUP BY lexeme
ORDER BY lexeme;

-- @explain T1 "whisk reviews that mention a wobble: the GIN index looks up both lexemes, intersects their lists, and only those rows are fetched."
SELECT id, body FROM reviews WHERE doc @@ to_tsquery('english', 'whisk & wobble');

-- @explain T1 "the same search on a tsvector computed on the fly with another configuration: nothing indexes that expression, so every row is parsed."
SELECT id, body FROM reviews WHERE to_tsvector('simple', body) @@ to_tsquery('simple', 'whisk & wobbles');

-- @step T1 "ranking 'whisk or wobble': how many reviews get each score."
SELECT round(ts_rank(doc, q)::numeric, 4) AS rank, count(*) AS reviews, min(body) AS example
FROM reviews, to_tsquery('english', 'whisk | wobble') AS q
WHERE doc @@ q
GROUP BY 1
ORDER BY 1 DESC;
