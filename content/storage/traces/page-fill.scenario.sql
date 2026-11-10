-- @title an empty page, filled one row at a time, then a delete, a vacuum and a reused slot
-- @engine pglite
-- @db lab
-- @sessions T1
-- @each heap(slots)

-- @setup
CREATE TABLE slots (id int, note text);

-- @probe "an empty table has no pages at all. the first insert creates page 0."

-- @step T1 "one short row. line pointer 1 goes right after the 24-byte header, the tuple goes at the very end of the page."
INSERT INTO slots VALUES (1, 'hi');

-- @step T1 "a 200-character row. its line pointer is still 4 bytes, but the tuple takes 232, packed in right below the first one."
INSERT INTO slots VALUES (2, repeat('-', 200));

-- @step T1 "a medium row. pd_lower creeps right by 4, pd_upper jumps left by the tuple's size. the free space is whatever is between them."
INSERT INTO slots VALUES (3, 'medium ' || repeat('=', 60));

-- @step T1 "another short one. four slots, four tuples, in the order they arrived."
INSERT INTO slots VALUES (4, 'yo');

-- @step T1 "delete row 2. nothing moves: the tuple stays, stamped with xmax, and slot 2 still points at it."
DELETE FROM slots WHERE id = 2;

-- @step T1 "VACUUM. the dead tuple is gone, and the tuples below it slid toward the end of the page to close the hole. slot 3 and slot 4 now point at new offsets, so their ctids didn't change."
VACUUM slots;

-- @step T1 "a new row takes the unused slot 2, so its ctid is (0,2). the slot number is reused, the bytes come from the free space."
INSERT INTO slots VALUES (5, 'new');
