-- @title percentile_cont against percentile_disc on eight salaries, and ordered string_agg
-- @engine pglite
-- @db school
-- @each

-- the percentile slider and the string_agg switch on ordered-set-aggregates read this file.

-- @step T1 "the eight instructors' salaries, in order."
SELECT name, salary FROM instructors ORDER BY salary, name;

-- @step T1 "both percentiles at eleven fractions, from 0 to 1, in one call each: they take an array of fractions and return an array of answers."
SELECT percentile_cont(ARRAY[0, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1])
         WITHIN GROUP (ORDER BY salary) AS cont,
       percentile_disc(ARRAY[0, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1])
         WITHIN GROUP (ORDER BY salary) AS disc
FROM instructors;

-- @step T1 "ORDER BY name inside the aggregate: each department's instructors, alphabetically."
SELECT dept, string_agg(name, ', ' ORDER BY name) AS instructors
FROM instructors
GROUP BY dept
ORDER BY dept;

-- @step T1 "ORDER BY salary DESC: the same people, best paid first. in CS, Marco Rossi moves ahead of Lena Fischer. the order inside the aggregate has nothing to do with the query's ORDER BY."
SELECT dept, string_agg(name, ', ' ORDER BY salary DESC) AS instructors
FROM instructors
GROUP BY dept
ORDER BY dept;

-- @step T1 "DISTINCT inside the aggregate: each department's credit values, once each. with DISTINCT, the ORDER BY may only use the aggregated expression."
SELECT dept, string_agg(DISTINCT credits::text, ', ' ORDER BY credits::text) AS credit_values
FROM courses
GROUP BY dept
ORDER BY dept;
