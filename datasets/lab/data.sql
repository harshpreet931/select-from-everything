INSERT INTO accounts (id, owner, balance) VALUES
  (1, 'alice', 100.00),
  (2, 'bob', 100.00),
  (3, 'carol', 50.00);

-- about 3 pages of 8 KB
INSERT INTO notes (id, body)
SELECT g, 'note ' || g || ': ' || repeat('.', 40)
FROM generate_series(1, 400) AS g
ORDER BY g;
