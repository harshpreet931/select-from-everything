-- @title the same INSERT through the analyzer, the rewriter and the planner, as the server logs them
-- @sessions T1
-- @each

-- @setup
CREATE TABLE notes (id int PRIMARY KEY, body text NOT NULL);
INSERT INTO notes VALUES (1, 'the first note'), (2, 'the second note');
VACUUM notes;

-- @step T1 +log "ask the server to log the tree each stage produces."
SET debug_print_parse = on;
SET debug_print_rewritten = on;
SET debug_print_plan = on;

-- @step T1 +log "the INSERT, through every stage: the analyzed tree, the rewritten tree (no views or rules here, so the same), and the plan."
INSERT INTO notes VALUES (3, 'hello from the capstone');

-- @step T1 +log "logging off again."
RESET debug_print_parse;
RESET debug_print_rewritten;
RESET debug_print_plan;

-- @explain T1 noanalyze "the plan as EXPLAIN draws it: a ModifyTable on top of a Result that makes one row."
INSERT INTO notes VALUES (4, 'another note');
