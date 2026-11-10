-- @title json vs jsonb on the same text, six operators on one event's props, two kinds of GIN index, and JSON_TABLE
-- @engine pglite
-- @db events
-- @each

-- the json/jsonb table, the operator switch, the index bars, the index switch and the JSON_TABLE result on types/jsonb read this.

-- @step T1 "one piece of text, stored as json and as jsonb: json keeps the text, jsonb keeps the meaning."
SELECT t.type, t.value, t.bytes
FROM (VALUES (1, 'json', '{"b": 1,   "a": 2, "a": 3}'::json::text, pg_column_size('{"b": 1,   "a": 2, "a": 3}'::json)),
             (2, 'jsonb', '{"b": 1,   "a": 2, "a": 3}'::jsonb::text, pg_column_size('{"b": 1,   "a": 2, "a": 3}'::jsonb))) AS t (n, type, value, bytes)
ORDER BY t.n;

-- @step T1 "-> takes a key and gives jsonb back: still json, quotes and all."
SELECT props -> 'utm' AS result, pg_typeof(props -> 'utm') AS type FROM events WHERE id = 26;

-- @step T1 "->> gives text: the value without its json quoting."
SELECT props ->> 'device' AS result, pg_typeof(props ->> 'device') AS type FROM events WHERE id = 26;

-- @step T1 "#> follows a path of keys, and gives jsonb."
SELECT props #> '{utm,source}' AS result, pg_typeof(props #> '{utm,source}') AS type FROM events WHERE id = 26;

-- @step T1 "#>> follows a path, and gives text."
SELECT props #>> '{utm,source}' AS result, pg_typeof(props #>> '{utm,source}') AS type FROM events WHERE id = 26;

-- @step T1 "@> asks whether the left contains the right, nested objects included."
SELECT props @> '{"utm": {"source": "search"}}' AS result, pg_typeof(props @> '{"utm": {"source": "search"}}') AS type FROM events WHERE id = 26;

-- @step T1 "@? asks whether a jsonpath finds anything."
SELECT props @? '$.utm ? (@.source == "search")' AS result, pg_typeof(props @? '$.utm ? (@.source == "search")') AS type FROM events WHERE id = 26;

-- @step T1 "two GIN indexes on props: the default operator class, and jsonb_path_ops."
CREATE INDEX ev_ops ON events USING gin (props);
CREATE INDEX ev_path_ops ON events USING gin (props jsonb_path_ops);
SELECT 'table' AS what, pg_relation_size('events') / 8192 AS pages
UNION ALL SELECT 'gin (props)', pg_relation_size('ev_ops') / 8192
UNION ALL SELECT 'gin (props jsonb_path_ops)', pg_relation_size('ev_path_ops') / 8192;

-- @step T1 "only the default index left."
DROP INDEX ev_path_ops;
ANALYZE events;

-- @step T1 "containment with the default index."
SELECT count(*) FROM events WHERE props @> '{"utm": {"source": "newsletter"}}';

-- @explain T1 "the default index serves @>."
SELECT count(*) FROM events WHERE props @> '{"utm": {"source": "newsletter"}}';

-- @step T1 "key existence with the default index."
SELECT count(*) FROM events WHERE props ? 'utm';

-- @explain T1 "and ?, because it indexes every key on its own."
SELECT count(*) FROM events WHERE props ? 'utm';

-- @step T1 "only jsonb_path_ops left."
DROP INDEX ev_ops;
CREATE INDEX ev_path_ops ON events USING gin (props jsonb_path_ops);
ANALYZE events;

-- @step T1 "containment with jsonb_path_ops."
SELECT count(*) FROM events WHERE props @> '{"utm": {"source": "newsletter"}}';

-- @explain T1 "jsonb_path_ops serves @>, from a smaller index."
SELECT count(*) FROM events WHERE props @> '{"utm": {"source": "newsletter"}}';

-- @step T1 "key existence with jsonb_path_ops."
SELECT count(*) FROM events WHERE props ? 'utm';

-- @explain T1 "but not ?: it stores hashes of whole paths to values, not keys on their own, so it reads the whole table."
SELECT count(*) FROM events WHERE props ? 'utm';

-- @step T1 "JSON_TABLE turns an order document's items into rows and typed columns."
SELECT jt.*
FROM JSON_TABLE(
  '{"order": 1042, "items": [{"sku": "KIT-0001", "qty": 2, "price": 49.00},
                             {"sku": "AUD-0005", "qty": 1, "price": 129.99, "gift": true}]}',
  '$.items[*]'
  COLUMNS (line FOR ORDINALITY,
           sku text PATH '$.sku',
           qty int PATH '$.qty',
           price numeric(10,2) PATH '$.price',
           gift boolean PATH '$.gift' DEFAULT false ON EMPTY)
) AS jt
ORDER BY jt.line;
