-- @title two serializable transactions check that a room is free, then both book it
-- @sessions T1 T2
-- @each xids locks

-- @setup
CREATE TABLE bookings (id int PRIMARY KEY, room int NOT NULL, night date NOT NULL);
CREATE INDEX bookings_room_night ON bookings (room, night);
INSERT INTO bookings SELECT g, g % 20, date '2026-12-01' + g % 23 FROM generate_series(1, 2000) AS g;
VACUUM ANALYZE bookings;

-- @step T1 "T1 starts a serializable transaction."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T2 "so does T2."
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- @step T1 "T1 checks that room 7 is free on christmas eve. it reads through the index, and leaves an SIRead lock on the index page it looked at. nothing is blocked by it."
SELECT count(*) AS taken FROM bookings WHERE room = 7 AND night = '2026-12-24';

-- @step T2 "T2 runs the same check, at the same time, and also sees zero."
SELECT count(*) AS taken FROM bookings WHERE room = 7 AND night = '2026-12-24';

-- @step T1 "T1 books the room. the insert lands in the range T2 read, which postgres notes as a read-write dependency. no wait."
INSERT INTO bookings VALUES (5001, 7, '2026-12-24');

-- @step T2 "T2 books it too. now each transaction wrote something the other one read: a cycle. still nobody waits."
INSERT INTO bookings VALUES (5002, 7, '2026-12-24');

-- @step T1 "T1 commits first, and wins."
COMMIT;

-- @step T2 errors=40001 "T2's commit fails with a serialization failure. retry it and the check sees T1's booking."
COMMIT;
