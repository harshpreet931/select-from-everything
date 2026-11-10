-- @title the booking schema from the schema interview: what the constraints refuse, and what each tenant sees
-- @engine pglite
-- @ext btree_gist
-- @each

-- @setup
CREATE TABLE hotels (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE rooms (
  id       int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hotel_id int NOT NULL REFERENCES hotels,
  room_no  text NOT NULL,
  beds     int NOT NULL CHECK (beds BETWEEN 1 AND 6),
  UNIQUE (hotel_id, room_no)
);
CREATE TABLE guests (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text NOT NULL, name text NOT NULL);
CREATE UNIQUE INDEX guests_email ON guests (lower(email));
CREATE TABLE room_rates (
  room_id int NOT NULL REFERENCES rooms,
  valid   daterange NOT NULL,
  price   numeric(8,2) NOT NULL CHECK (price > 0),
  PRIMARY KEY (room_id, valid WITHOUT OVERLAPS)
);
CREATE TABLE bookings (
  id       int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hotel_id int NOT NULL REFERENCES hotels,
  room_id  int NOT NULL REFERENCES rooms,
  guest_id int NOT NULL REFERENCES guests,
  stay     daterange NOT NULL CHECK (NOT isempty(stay)),
  status   text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  EXCLUDE USING gist (room_id WITH =, stay WITH &&) WHERE (status = 'confirmed')
);
CREATE INDEX bookings_guest ON bookings (guest_id, lower(stay));
INSERT INTO hotels (name) VALUES ('harbour view'), ('the old mill');
INSERT INTO rooms (hotel_id, room_no, beds) VALUES (1, '101', 2), (1, '102', 2), (2, '1', 4);
INSERT INTO guests (email, name) VALUES ('ada@example.com', 'Ada Lovelace'), ('grace@example.com', 'Grace Hopper');
INSERT INTO room_rates VALUES (1, '[2026-01-01,2026-12-01)', 120.00), (1, '[2026-12-01,2027-01-01)', 180.00);
INSERT INTO bookings (hotel_id, room_id, guest_id, stay) VALUES (1, 1, 1, '[2026-12-20,2026-12-27)');
INSERT INTO bookings (hotel_id, room_id, guest_id, stay, status) VALUES (1, 2, 2, '[2026-12-20,2026-12-27)', 'cancelled');
INSERT INTO bookings (hotel_id, room_id, guest_id, stay) VALUES (2, 3, 2, '[2026-12-24,2026-12-26)');
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON bookings USING (hotel_id = nullif(current_setting('app.hotel_id', true), '')::int);
CREATE ROLE booking_app;
GRANT SELECT, INSERT ON bookings TO booking_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO booking_app;

-- @step T1 errors=23P01 "room 101 is already booked from the 20th to the 27th. an overlapping stay is refused by the exclusion constraint, with the conflicting row in the message."
INSERT INTO bookings (hotel_id, room_id, guest_id, stay) VALUES (1, 1, 2, '[2026-12-24,2026-12-29)');

-- @step T1 "a stay that starts the day the last one ends doesn't overlap: [) ranges include the first day and exclude the last."
INSERT INTO bookings (hotel_id, room_id, guest_id, stay) VALUES (1, 1, 2, '[2026-12-27,2026-12-30)') RETURNING id, room_id, stay;

-- @step T1 "room 102 has a booking for the same dates, but it was cancelled, and the constraint only looks at confirmed rows."
INSERT INTO bookings (hotel_id, room_id, guest_id, stay) VALUES (1, 2, 1, '[2026-12-22,2026-12-25)') RETURNING id, room_id, stay;

-- @step T1 errors=23514 "an empty stay (checking out the day you check in) is refused by the CHECK."
INSERT INTO bookings (hotel_id, room_id, guest_id, stay) VALUES (1, 1, 1, '[2026-12-31,2026-12-31)');

-- @step T1 errors=23P01 "rates use a temporal primary key: room 101 can't have two prices for the same night."
INSERT INTO room_rates VALUES (1, '[2026-12-24,2026-12-26)', 250.00);

-- @step T1 "the app connects as booking_app with hotel 1 in a setting. row-level security shows it hotel 1's bookings only."
SET ROLE booking_app;
SELECT set_config('app.hotel_id', '1', false) IS NOT NULL AS set;
SELECT id, hotel_id, room_id, stay, status FROM bookings ORDER BY id;

-- @step T1 "the same query with hotel 2 in the setting: only the old mill's one booking."
SELECT set_config('app.hotel_id', '2', false) IS NOT NULL AS set;
SELECT id, hotel_id, room_id, stay, status FROM bookings ORDER BY id;

-- @step T1 "with no hotel set, the policy compares against NULL, which is never true: no rows, not all rows."
SELECT set_config('app.hotel_id', '', false) IS NOT NULL AS set;
SELECT id, hotel_id, room_id, stay, status FROM bookings ORDER BY id;

-- @step T1 errors=42501 "hotel 2's app tries to write a booking for hotel 1. the policy's USING also checks new rows, and refuses."
SELECT set_config('app.hotel_id', '2', false) IS NOT NULL AS set;
INSERT INTO bookings (hotel_id, room_id, guest_id, stay) VALUES (1, 1, 1, '[2027-01-02,2027-01-04)');
