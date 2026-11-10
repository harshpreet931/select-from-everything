-- @title one query through the analyzer, the rewriter and the planner, as the server logs them
-- @db shop
-- @sessions T1
-- @each

-- @setup
CREATE VIEW londoners AS SELECT id, name FROM customers WHERE city = 'London';

-- @step T1 +log "ask the server to log the tree each stage produces."
SET debug_print_parse = on;
SET debug_print_rewritten = on;
SET debug_print_plan = on;

-- @step T1 +log "the query, through every stage: the analyzed tree, the tree after the rewriter expands the view, and the plan."
SELECT name FROM londoners WHERE id = 42;
