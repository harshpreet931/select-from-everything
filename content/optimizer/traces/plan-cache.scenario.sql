-- @title one prepared statement, executed with a common value five times, then planned once for any value
-- @engine pglite
-- @db events
-- @each

-- generic-plans reads this file. by_kind is prepared once; executions 1-8 are each captured as
-- the plan EXECUTE used (EXPLAIN EXECUTE goes through the plan cache like EXECUTE does, and counts
-- toward its choice), with pg_prepared_statements' counters after each. then the 'view' query
-- run for real under the three plan_cache_mode settings.

-- @setup
CREATE INDEX events_kind ON events (kind);
ANALYZE events;

-- @step T1 "prepare it: parsed and analyzed now, planned at execution."
PREPARE by_kind(text) AS SELECT max(occurred_at) FROM events WHERE kind = $1;

-- @explain T1 noanalyze "execution 1, kind = 'view': a custom plan, made for 'view'. 60% of the table, so a seq scan."
EXECUTE by_kind('view');

-- @step T1 "the counters after execution 1."
SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = 'by_kind';

-- @explain T1 noanalyze "execution 2, kind = 'view': a custom plan again."
EXECUTE by_kind('view');

-- @step T1 "the counters after execution 2."
SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = 'by_kind';

-- @explain T1 noanalyze "execution 3, kind = 'view': a custom plan again."
EXECUTE by_kind('view');

-- @step T1 "the counters after execution 3."
SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = 'by_kind';

-- @explain T1 noanalyze "execution 4, kind = 'view': a custom plan again."
EXECUTE by_kind('view');

-- @step T1 "the counters after execution 4."
SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = 'by_kind';

-- @explain T1 noanalyze "execution 5: still custom. postgres has now seen five custom plans and their average cost."
EXECUTE by_kind('view');

-- @step T1 "the counters after execution 5."
SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = 'by_kind';

-- @explain T1 noanalyze "execution 6: postgres prices a generic plan, for any $1. it's cheaper than the custom plans' average, so it switches."
EXECUTE by_kind('view');

-- @step T1 "the counters after execution 6."
SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = 'by_kind';

-- @explain T1 noanalyze "execution 7, kind = 'signup': the generic plan again. it never looks at the value."
EXECUTE by_kind('signup');

-- @step T1 "the counters after execution 7."
SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = 'by_kind';

-- @explain T1 noanalyze "execution 8, kind = 'purchase': and again, from now on."
EXECUTE by_kind('purchase');

-- @step T1 "the counters after execution 8."
SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = 'by_kind';

-- @step T1 "plan_cache_mode = auto."
SET plan_cache_mode = auto;

-- @step T1 "the count, under auto."
SELECT count(*) FROM events WHERE kind = 'view';

-- @explain T1 "plan_cache_mode = auto: the cached generic plan, run for 'view'. it was priced for 5,000 rows and gets 15,112."
EXECUTE by_kind('view');

-- @step T1 "plan_cache_mode = force_custom_plan."
SET plan_cache_mode = force_custom_plan;

-- @step T1 "the count, under force_custom_plan."
SELECT count(*) FROM events WHERE kind = 'view';

-- @explain T1 "force_custom_plan: planned for 'view' every time. the seq scan."
EXECUTE by_kind('view');

-- @step T1 "plan_cache_mode = force_generic_plan."
SET plan_cache_mode = force_generic_plan;

-- @step T1 "the count, under force_generic_plan."
SELECT count(*) FROM events WHERE kind = 'view';

-- @explain T1 "force_generic_plan: the generic plan from the first execution on."
EXECUTE by_kind('view');

-- @step T1 "back to the default."
RESET plan_cache_mode;
