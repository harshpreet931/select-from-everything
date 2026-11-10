-- @title a room-booking table keyed by (room, during WITHOUT OVERLAPS), and four bookings to try
-- @engine pglite
-- @ext btree_gist
-- @each

-- temporal-keys reads these for its RunPick. PGlite, with btree_gist, like the run buttons.

-- @step T1 "bookings keyed by room and stay. the key is checked for overlap, not equality."
CREATE TABLE bookings (
  room   int       NOT NULL,
  guest  text      NOT NULL,
  during daterange NOT NULL,
  PRIMARY KEY (room, during WITHOUT OVERLAPS)
);
INSERT INTO bookings VALUES (101, 'ada', '[2026-03-02,2026-03-05)'), (101, 'grace', '[2026-03-05,2026-03-07)');

-- @step T1 errors=23P01 "edsger wants room 101 from march 4 to 6. that overlaps both stays, and the key refuses it."
INSERT INTO bookings VALUES (101, 'edsger', '[2026-03-04,2026-03-06)');

-- @step T1 "the same dates in room 102: a different key, no conflict."
INSERT INTO bookings VALUES (102, 'edsger', '[2026-03-04,2026-03-06)');

-- @step T1 "the bookings."
SELECT room, guest, during FROM bookings ORDER BY room, lower(during);

-- @step T1 "room 101 from march 7, the day grace leaves. half-open ranges touch without overlapping."
INSERT INTO bookings VALUES (101, 'barbara', '[2026-03-07,2026-03-09)');

-- @step T1 "the bookings."
SELECT room, guest, during FROM bookings ORDER BY room, lower(during);

-- @step T1 errors=23514 "an empty stay. a WITHOUT OVERLAPS key refuses empty ranges outright."
INSERT INTO bookings VALUES (103, 'nobody', 'empty');
