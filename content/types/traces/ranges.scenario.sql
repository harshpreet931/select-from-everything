-- @title ranges as written and as stored, march bookings with an exclusion constraint, and the free days as a multirange
-- @engine pglite
-- @each

-- the range lines, the bookings line and the free-days result on types/ranges read this.

-- @step T1 "five int4ranges as you might write them, and the canonical form postgres stores: inclusive lower bound, exclusive upper."
SELECT w AS written, r AS stored, lower(r) AS lower, upper(r) AS upper, isempty(r) AS empty,
       (SELECT array_agg(i ORDER BY i) FROM generate_series(0, 8) AS i WHERE i <@ r) AS members
FROM (VALUES (1, '[2,5)'), (2, '[2,5]'), (3, '(2,5]'), (4, '(2,5)'), (5, '[4,4)')) AS v (n, w)
CROSS JOIN LATERAL (SELECT w::int4range AS r) AS c
ORDER BY n;

-- @step T1 "a bookings table for one room: no two stays may overlap."
CREATE TABLE bookings (
  guest  text NOT NULL,
  nights daterange NOT NULL,
  EXCLUDE USING gist (nights WITH &&)
);
INSERT INTO bookings VALUES
  ('ada',   '[2026-03-02,2026-03-05)'),
  ('grace', '[2026-03-05,2026-03-07)'),
  ('alan',  '[2026-03-09,2026-03-11)');

-- @step T1 errors=23P01 "a stay from the 4th to the 6th overlaps both ada and grace. the constraint refuses it."
INSERT INTO bookings VALUES ('edsger', '[2026-03-04,2026-03-06)');

-- @step T1 "the bookings, each against the refused stay: && overlaps, -|- is adjacent (touching, not overlapping)."
SELECT guest, nights, lower(nights) - date '2026-03-01' AS from_day, upper(nights) - date '2026-03-01' AS to_day,
       nights && daterange('2026-03-04', '2026-03-06') AS overlaps_4_to_6,
       nights -|- daterange('2026-03-07', '2026-03-09') AS touches_7_to_9
FROM bookings
ORDER BY nights;

-- @step T1 "every booked night as one multirange, and march 1 to 11 minus it: the free nights."
SELECT range_agg(nights) AS booked,
       datemultirange(daterange('2026-03-01', '2026-03-11')) - range_agg(nights) AS free
FROM bookings;
