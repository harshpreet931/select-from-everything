-- @title GROUP BY against OVER, four windows over the same rows, and where windows run
-- @engine pglite
-- @db school
-- @each

-- the GROUP BY / OVER switch, the four-window switch and the clause stepper on
-- window-functions read this file. school's eight instructors.

-- @step T1 "GROUP BY dept: the eight instructors become four rows, one per department. the names are gone."
SELECT dept, count(*) AS people, round(avg(salary)) AS dept_avg
FROM instructors
GROUP BY dept
ORDER BY dept;

-- @step T1 "OVER (PARTITION BY dept): the same averages, and all eight rows are still here, each with its department's numbers next to it."
SELECT name, dept, salary,
       count(*) OVER (PARTITION BY dept) AS people,
       round(avg(salary) OVER (PARTITION BY dept)) AS dept_avg
FROM instructors
ORDER BY dept, salary DESC;

-- @step T1 "OVER (): one window holding every row. every row gets the count and the total of all eight."
SELECT name, dept, salary,
       count(*) OVER () AS n,
       sum(salary) OVER () AS total
FROM instructors
ORDER BY dept, salary DESC;

-- @step T1 "PARTITION BY dept: a window per department. Hannah's row only sees CS."
SELECT name, dept, salary,
       count(*) OVER (PARTITION BY dept) AS n,
       sum(salary) OVER (PARTITION BY dept) AS total
FROM instructors
ORDER BY dept, salary DESC;

-- @step T1 "ORDER BY salary DESC inside OVER: now each row sees the rows up to itself. the count and the total became running ones."
SELECT name, dept, salary,
       count(*) OVER (ORDER BY salary DESC) AS n,
       sum(salary) OVER (ORDER BY salary DESC) AS total
FROM instructors
ORDER BY salary DESC;

-- @step T1 "both: a running count and total that start over in every department."
SELECT name, dept, salary,
       count(*) OVER (PARTITION BY dept ORDER BY salary DESC) AS n,
       sum(salary) OVER (PARTITION BY dept ORDER BY salary DESC) AS total
FROM instructors
ORDER BY dept, salary DESC;

-- @stages T1 "the logical order, with a window in it."
SELECT name, dept, salary, rank() OVER w AS dept_rank
FROM instructors
WHERE salary < 95000
WINDOW w AS (PARTITION BY dept ORDER BY salary DESC)
ORDER BY dept_rank, salary DESC
LIMIT 3;
-- @stage FROM "FROM: all eight instructors."
SELECT name, dept, salary FROM instructors ORDER BY dept, salary DESC;
-- @stage WHERE "WHERE runs first and drops Hannah Okoye (98,000). the window will never see her."
SELECT name, dept, salary FROM instructors WHERE salary < 95000 ORDER BY dept, salary DESC;
-- @stage WINDOW "the window ranks each department's survivors by salary. with Hannah gone, Marco Rossi is number one in CS. seven rows in, seven rows out."
SELECT name, dept, salary, rank() OVER (PARTITION BY dept ORDER BY salary DESC) AS dept_rank
FROM instructors WHERE salary < 95000 ORDER BY dept, salary DESC;
-- @stage ORDER BY "ORDER BY sorts by the rank, which only exists because the window ran first."
SELECT name, dept, salary, rank() OVER (PARTITION BY dept ORDER BY salary DESC) AS dept_rank
FROM instructors WHERE salary < 95000 ORDER BY dept_rank, salary DESC;
-- @stage LIMIT "LIMIT keeps three. Oliver Grant is number one in HIST too, but the cut comes last, after every rank is decided."
SELECT name, dept, salary, rank() OVER (PARTITION BY dept ORDER BY salary DESC) AS dept_rank
FROM instructors WHERE salary < 95000 ORDER BY dept_rank, salary DESC LIMIT 3;
