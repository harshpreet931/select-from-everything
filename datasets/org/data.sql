-- org data.
--   manager_id = (id + 1) / 3 for id >= 2: a complete ternary tree under the CEO (id 1, no
--     manager), six levels deep. never a cycle (the CYCLE section makes its own).
--   each director (ids 5 to 13) runs one department, and everyone under them is in it
--   salaries are set by level and rounded to 1,000, so there are ties (rank vs dense_rank)
--   research (8) has no employees; people (7) has a NULL budget
--   employee 300 is a contractor with no department; 57 and 203 are both Priya Shah
--   oncall: 7 days, two engineers, both on call every day (write skew)

CREATE SCHEMA gen;
CREATE FUNCTION gen.pick(i int, salt int, m int) RETURNS int
  LANGUAGE sql IMMUTABLE STRICT
  RETURN ((hashint4(i * 977 + salt)::bigint + 2147483648) % m)::int;

INSERT INTO departments (id, name, budget) VALUES
  (1, 'engineering', 2400000.00),
  (2, 'product', 900000.00),
  (3, 'design', 600000.00),
  (4, 'sales', 1200000.00),
  (5, 'support', 500000.00),
  (6, 'finance', 700000.00),
  (7, 'people', NULL),
  (8, 'research', 300000.00);

INSERT INTO employees (id, name, manager_id, dept_id, title, salary, hired_on)
WITH RECURSIVE tree (id, level, director) AS (
  SELECT 1, 0, NULL::int
  UNION ALL
  SELECT c.id, t.level + 1, CASE WHEN t.level + 1 = 2 THEN c.id ELSE t.director END
  FROM tree AS t
  CROSS JOIN LATERAL (VALUES (3 * t.id - 1), (3 * t.id), (3 * t.id + 1)) AS c (id)
  WHERE c.id <= 300
)
SELECT t.id,
       CASE
         WHEN t.id IN (57, 203) THEN 'Priya Shah'
         ELSE (ARRAY['Liam','Olivia','Noah','Emma','Mateo','Amelia','Lucas','Sofia','Arjun','Aisha',
                     'Kenji','Yuna','Omar','Leila','Diego','Valentina','Kofi','Ama','Ivan','Elena',
                     'Chen','Mei','Tariq','Fatima','Lars','Ingrid','Rahul','Ananya','Jonas','Clara'])[1 + gen.pick(t.id, 71, 30)]
              || ' ' ||
              (ARRAY['Smith','Garcia','Kim','Nguyen','Patel','Mueller','Rossi','Silva','Cohen','Okafor',
                     'Tanaka','Novak','Dubois','Jensen','Kowalski','Haddad','Mensah','Petrov','Costa','Larsen',
                     'Singh','Wong','Ahmed','Moreau','Schmidt','Romano','Santos','Lopez','Hansen','Yilmaz'])[1 + gen.pick(t.id, 72, 30)]
       END,
       CASE WHEN t.id = 1 THEN NULL ELSE (t.id + 1) / 3 END,
       CASE
         WHEN t.id = 300 THEN NULL
         WHEN t.level < 2 THEN 1
         ELSE (ARRAY[1, 1, 2, 3, 4, 4, 5, 6, 7])[t.director - 4]
       END,
       CASE WHEN t.id = 300 THEN 'contractor'
            ELSE (ARRAY['ceo', 'vp', 'director', 'manager', 'lead', 'associate'])[t.level + 1]
       END,
       (ARRAY[300000, 220000, 160000, 120000, 95000, 70000])[t.level + 1] + 1000 * gen.pick(t.id, 73, 5),
       date '2015-01-05' + t.id * 9 + gen.pick(t.id, 74, 9)
FROM tree AS t
ORDER BY t.id;

INSERT INTO oncall (shift_date, employee_id, on_call)
SELECT d::date, e, true
FROM generate_series(date '2026-06-01', date '2026-06-07', interval '1 day') AS d
CROSS JOIN (VALUES (150), (151)) AS x (e)
ORDER BY 1, 2;

DROP SCHEMA gen CASCADE;
