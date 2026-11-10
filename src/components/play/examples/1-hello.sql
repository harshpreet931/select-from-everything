-- @label hello
-- @db empty
CREATE TABLE notes (
  id   int PRIMARY KEY,
  body text NOT NULL
);

INSERT INTO notes VALUES
  (1, 'this is a real postgres'),
  (2, 'it runs inside this tab'),
  (3, 'nothing leaves your machine');

SELECT id, body FROM notes ORDER BY id;
