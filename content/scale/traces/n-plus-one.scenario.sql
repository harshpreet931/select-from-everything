-- @title one orders page, four ways to fetch it, with the pages each one touches
-- @engine pglite
-- @db shop
-- @each

-- orms-and-n-plus-one reads this file: captured on PGlite with the shop dataset, so the plans match
-- the run buttons. the N+1 version is 101 statements in an app; here its 100 lookups are a LATERAL
-- join, which does the same index lookups in one statement (loops=100), so their pages can be counted.

-- @explain T1 "the list query: the 100 latest orders."
SELECT id FROM orders ORDER BY ordered_at DESC, id LIMIT 100;

-- @explain T1 "one of the 100 follow-up queries: the items of one order."
SELECT sum(qty) FROM order_items WHERE order_id = 9999;

-- @explain T1 "all 100 follow-up lookups, done the way the N+1 does them: one index lookup per order."
SELECT o.id, i.items
FROM (SELECT id FROM orders ORDER BY ordered_at DESC, id LIMIT 100) AS o
CROSS JOIN LATERAL (SELECT sum(qty) AS items FROM order_items WHERE order_id = o.id) AS i;

-- @explain T1 "one join: the 100 orders and their item counts in one statement."
SELECT o.id, sum(oi.qty) AS items
FROM (SELECT id FROM orders ORDER BY ordered_at DESC, id LIMIT 100) AS o
LEFT JOIN order_items AS oi ON oi.order_id = o.id
GROUP BY o.id
ORDER BY o.id;

-- @step T1 "the app already has the 100 ids from the list query, so the eager load's second query gets them as one array parameter."
PREPARE items_for(int[]) AS
  SELECT order_id, sum(qty) AS items FROM order_items WHERE order_id = ANY ($1) GROUP BY order_id ORDER BY order_id;

-- @explain T1 "the second query of an eager load: every item for the 100 ids at once, with = ANY."
EXECUTE items_for('{9901,9902,9903,9904,9905,9906,9907,9908,9909,9910,9911,9912,9913,9914,9915,9916,9917,9918,9919,9920,9921,9922,9923,9924,9925,9926,9927,9928,9929,9930,9931,9932,9933,9934,9935,9936,9937,9938,9939,9940,9941,9942,9943,9944,9945,9946,9947,9948,9949,9950,9951,9952,9953,9954,9955,9956,9957,9958,9959,9960,9961,9962,9963,9964,9965,9966,9967,9968,9969,9970,9971,9972,9973,9974,9975,9976,9977,9978,9979,9980,9981,9982,9983,9984,9985,9986,9987,9988,9989,9990,9991,9992,9993,9994,9995,9996,9997,9998,9999,10000}');
