-- @title which page each of the lab's 400 notes lives on
-- @engine pglite
-- @db lab
-- @sessions T1
-- @each

-- @step T1 "notes, page by page: how many rows each page holds, and which ids."
SELECT (ctid::text::point)[0]::int AS page, count(*) AS rows, min(id) AS first_id, max(id) AS last_id
FROM notes GROUP BY 1 ORDER BY 1;
