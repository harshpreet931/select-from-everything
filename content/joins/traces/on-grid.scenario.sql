-- @title two tiny tables, every ON and every join kind, from postgres itself
-- @engine pglite
-- @each

-- the grid on joins-in-one-picture reads these results: which customer meets which store under
-- each ON, for INNER and LEFT. names and stores are unique, so a result row says exactly which
-- cell of the grid it came from. nothing is evaluated in the browser.

-- @setup
CREATE TABLE customers (name text, city text);
INSERT INTO customers VALUES ('Ada', 'London'), ('Alan', 'London'), ('Grace', 'Paris'), ('Edsger', NULL);
CREATE TABLE stores (city text, store text);
INSERT INTO stores VALUES ('London', 'soho'), ('Paris', 'marais'), ('Berlin', 'mitte'), (NULL, 'online');

-- @step T1 "the left table, in the order the grid draws it."
SELECT name, city FROM customers ORDER BY CASE name WHEN 'Ada' THEN 1 WHEN 'Alan' THEN 2 WHEN 'Grace' THEN 3 ELSE 4 END;

-- @step T1 "the right table, in the order the grid draws it."
SELECT city, store FROM stores ORDER BY CASE store WHEN 'soho' THEN 1 WHEN 'marais' THEN 2 WHEN 'mitte' THEN 3 ELSE 4 END;

-- @step T1 "the equi-join: a pair survives when the cities are equal. Edsger's NULL equals nothing, not even the online store's NULL."
SELECT c.name, c.city, s.city, s.store FROM customers AS c JOIN stores AS s ON s.city = c.city ORDER BY c.name, s.store;

-- @step T1 "ON true keeps every pair: 4 × 4 = 16 rows. that's CROSS JOIN."
SELECT c.name, c.city, s.city, s.store FROM customers AS c JOIN stores AS s ON true ORDER BY c.name, s.store;

-- @step T1 "the cities differ: 6 pairs. a NULL city is unknown against everything, so Edsger and the online store sit this one out too."
SELECT c.name, c.city, s.city, s.store FROM customers AS c JOIN stores AS s ON s.city <> c.city ORDER BY c.name, s.store;

-- @step T1 "equal cities, and not the soho store: ON can test anything, from either side."
SELECT c.name, c.city, s.city, s.store FROM customers AS c JOIN stores AS s ON s.city = c.city AND s.store <> 'soho' ORDER BY c.name, s.store;

-- @step T1 "IS NOT DISTINCT FROM treats two NULLs as the same, so Edsger finally meets the online store."
SELECT c.name, c.city, s.city, s.store FROM customers AS c JOIN stores AS s ON s.city IS NOT DISTINCT FROM c.city ORDER BY c.name, s.store;

-- @step T1 "ON false: no pair survives."
SELECT c.name, c.city, s.city, s.store FROM customers AS c JOIN stores AS s ON false ORDER BY c.name, s.store;

-- @step T1 "LEFT JOIN, equal cities: the 3 pairs, plus Edsger, who matched nobody, padded with NULLs."
SELECT c.name, c.city, s.city, s.store FROM customers AS c LEFT JOIN stores AS s ON s.city = c.city ORDER BY c.name, s.store;

-- @step T1 "LEFT JOIN, ON true: every customer already has a partner, so there's nobody to pad."
SELECT c.name, c.city, s.city, s.store FROM customers AS c LEFT JOIN stores AS s ON true ORDER BY c.name, s.store;

-- @step T1 "LEFT JOIN, the cities differ: the 6 pairs, plus Edsger again."
SELECT c.name, c.city, s.city, s.store FROM customers AS c LEFT JOIN stores AS s ON s.city <> c.city ORDER BY c.name, s.store;

-- @step T1 "LEFT JOIN, equal and not soho: only Grace keeps a partner. Ada and Alan lost theirs to the ON, so they come back padded."
SELECT c.name, c.city, s.city, s.store FROM customers AS c LEFT JOIN stores AS s ON s.city = c.city AND s.store <> 'soho' ORDER BY c.name, s.store;

-- @step T1 "LEFT JOIN, IS NOT DISTINCT FROM: every customer has a partner now, Edsger included."
SELECT c.name, c.city, s.city, s.store FROM customers AS c LEFT JOIN stores AS s ON s.city IS NOT DISTINCT FROM c.city ORDER BY c.name, s.store;

-- @step T1 "LEFT JOIN, ON false: no pair survives, so every customer comes back once, padded. a LEFT JOIN never has fewer rows than its left table."
SELECT c.name, c.city, s.city, s.store FROM customers AS c LEFT JOIN stores AS s ON false ORDER BY c.name, s.store;
