-- @title window frames over the nine leads under director 5: every mode, four frames, and EXCLUDE
-- @engine pglite
-- @db org
-- @each

-- every frame figure on window-frames reads this file. leads is a copy of the nine leads under
-- director 5, stored in (salary, id) order, so ties reach every window in id order and a ROWS
-- frame is a contiguous run of the table as printed. the frame column is array_agg(id) over the
-- same window: postgres's own list of the rows that fed the aggregate.

-- @setup
CREATE TABLE leads AS
SELECT id, name, salary FROM employees WHERE manager_id IN (14, 15, 16) ORDER BY salary, id;
VACUUM ANALYZE leads;

-- @step T1 "the nine leads, in salary order. three pairs of ties and one three-way tie at the top."
SELECT id, name, salary FROM leads ORDER BY salary, id;

-- @step T1 "ROWS counts physical rows: from the first row of the window down to this one, and not one row further, even when the next row has the same salary."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
ORDER BY salary, id;

-- @step T1 "RANGE goes by value: down to this row and every row with the same salary. this is the default frame, the one you get by writing only ORDER BY."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
ORDER BY salary, id;

-- @step T1 "GROUPS counts peer groups: every group up to and including this row's group. with UNBOUNDED and CURRENT ROW it lands where RANGE does."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             GROUPS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
ORDER BY salary, id;

-- @step T1 "ROWS 1 PRECEDING AND 1 FOLLOWING: the row above and the row below, whatever their salaries. which tied row counts as above is up to the sort."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING)
ORDER BY salary, id;

-- @step T1 "RANGE 1000 PRECEDING AND 1000 FOLLOWING: every row whose salary is within 1,000 of this row's. the offset is in salary units, not rows."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             RANGE BETWEEN 1000 PRECEDING AND 1000 FOLLOWING)
ORDER BY salary, id;

-- @step T1 "GROUPS 1 PRECEDING AND 1 FOLLOWING: this row's peer group, plus the whole group just below it and the whole group just above it."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             GROUPS BETWEEN 1 PRECEDING AND 1 FOLLOWING)
ORDER BY salary, id;

-- @step T1 "ROWS from this row to the last one. the rows above it are out, even its own peers."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING)
ORDER BY salary, id;

-- @step T1 "RANGE from this row's first peer to the end. peers above this row are back in."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             RANGE BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING)
ORDER BY salary, id;

-- @step T1 "GROUPS from this row's group to the last group. same rows as RANGE here."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             GROUPS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING)
ORDER BY salary, id;

-- @step T1 "UNBOUNDED both ways: the whole partition, for every row, in every mode. this is the frame last_value needs."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
ORDER BY salary, id;

-- @step T1 "UNBOUNDED both ways: the whole partition, for every row, in every mode. this is the frame last_value needs."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
ORDER BY salary, id;

-- @step T1 "UNBOUNDED both ways: the whole partition, for every row, in every mode. this is the frame last_value needs."
SELECT id, name, salary,
       array_agg(id)    OVER w AS frame,
       sum(salary)      OVER w AS sum,
       last_value(name) OVER w AS last_value
FROM leads
WINDOW w AS (ORDER BY salary
             GROUPS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
ORDER BY salary, id;

-- @step T1 "EXCLUDE NO OTHERS is the default: the whole frame, the current row included."
SELECT id, name, salary,
       array_agg(id) OVER w AS frame,
       count(*)      OVER w AS n,
       round(avg(salary) OVER w) AS avg
FROM leads
WINDOW w AS (ORDER BY salary
             ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
             EXCLUDE NO OTHERS)
ORDER BY salary, id;

-- @step T1 "EXCLUDE CURRENT ROW: everyone but this row. the average of everybody else."
SELECT id, name, salary,
       array_agg(id) OVER w AS frame,
       count(*)      OVER w AS n,
       round(avg(salary) OVER w) AS avg
FROM leads
WINDOW w AS (ORDER BY salary
             ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
             EXCLUDE CURRENT ROW)
ORDER BY salary, id;

-- @step T1 "EXCLUDE GROUP: this row and all its peers are out. the average of everyone paid differently."
SELECT id, name, salary,
       array_agg(id) OVER w AS frame,
       count(*)      OVER w AS n,
       round(avg(salary) OVER w) AS avg
FROM leads
WINDOW w AS (ORDER BY salary
             ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
             EXCLUDE GROUP)
ORDER BY salary, id;

-- @step T1 "EXCLUDE TIES: the peers are out, but the current row stays in."
SELECT id, name, salary,
       array_agg(id) OVER w AS frame,
       count(*)      OVER w AS n,
       round(avg(salary) OVER w) AS avg
FROM leads
WINDOW w AS (ORDER BY salary
             ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
             EXCLUDE TIES)
ORDER BY salary, id;
