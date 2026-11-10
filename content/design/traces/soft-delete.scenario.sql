-- @title a soft-deleted customer tries to sign up again, and the unique constraint remembers her
-- @engine pglite
-- @each

-- history-and-soft-delete reads these for its TableSteps.

-- @step T1 "customers with a deleted_at column: NULL means live."
SET TimeZone = 'UTC';
CREATE TABLE customers (
  id         int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL UNIQUE,
  name       text NOT NULL,
  deleted_at timestamptz
);
INSERT INTO customers (email, name) VALUES ('ada@example.com', 'Ada Lovelace'), ('grace@example.com', 'Grace Okafor');

-- @step T1 "two live customers."
SELECT id, email, deleted_at FROM customers ORDER BY id;

-- @step T1 "Ada closes her account. nothing is deleted: the row gets a timestamp."
UPDATE customers SET deleted_at = '2026-03-10 09:00+00' WHERE email = 'ada@example.com';

-- @step T1 "after it."
SELECT id, email, deleted_at FROM customers ORDER BY id;

-- @step T1 errors=23505 "a month later Ada signs up again. UNIQUE (email) still sees the deleted row, and refuses."
INSERT INTO customers (email, name) VALUES ('ada@example.com', 'Ada Lovelace');

-- @step T1 "the fix: uniqueness only among live rows, a partial unique index."
ALTER TABLE customers DROP CONSTRAINT customers_email_key;
CREATE UNIQUE INDEX customers_email_live ON customers (email) WHERE deleted_at IS NULL;

-- @step T1 "the same sign-up now works: the old row is outside the index."
INSERT INTO customers (email, name) VALUES ('ada@example.com', 'Ada Lovelace');

-- @step T1 "two rows for ada@example.com, one deleted, one live."
SELECT id, email, deleted_at FROM customers ORDER BY id;

-- @step T1 errors=23505 "and the rule still holds where it matters: two live rows with one email are refused."
INSERT INTO customers (email, name) VALUES ('ada@example.com', 'Ada again');
