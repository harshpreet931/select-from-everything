-- @title 'ab' stored as char(5), varchar(5) and text, byte by byte
-- @engine pglite
-- @each

-- the three byte strips at the top of types/text-and-collation read this.

-- @step T1 "one table, the same two letters in three types."
CREATE TABLE pad (c char(5), v varchar(5), t text);
INSERT INTO pad VALUES ('ab', 'ab', 'ab');

-- @step T1 "the bytes each one takes in the row: a 1-byte length header, then the characters. char(5) stores its padding."
SELECT pg_column_size(c) AS char_5, pg_column_size(v) AS varchar_5, pg_column_size(t) AS text,
       octet_length(c) AS char_octets, length(c) AS char_length
FROM pad;
