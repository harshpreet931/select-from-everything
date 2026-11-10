-- lab: tiny tables for looking at pages, tuples, the WAL and the buffer pool.
-- never vacuumed or analyzed: hint bits aren't set yet and there are no statistics, so the
-- MVCC and vacuum chapters start from pages exactly as the inserts left them.

CREATE TABLE accounts (
  id      int PRIMARY KEY,
  owner   text NOT NULL,
  balance numeric(12,2) NOT NULL
);

CREATE TABLE notes (
  id   int PRIMARY KEY,
  body text NOT NULL
);
