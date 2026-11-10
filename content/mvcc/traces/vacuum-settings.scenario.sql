-- @title the vacuum, autovacuum and freezing settings a fresh postgres 18.6 server starts with
-- @sessions T1
-- @each

-- @step T1 "autovacuum's triggers and its cost budget, as pg_settings reports them. -1 means: use the plain vacuum_ setting."
SELECT name, setting, unit
FROM pg_settings
WHERE name IN ('autovacuum_naptime', 'autovacuum_max_workers', 'autovacuum_worker_slots',
               'autovacuum_vacuum_threshold', 'autovacuum_vacuum_scale_factor', 'autovacuum_vacuum_max_threshold',
               'autovacuum_vacuum_insert_threshold', 'autovacuum_vacuum_insert_scale_factor',
               'autovacuum_analyze_threshold', 'autovacuum_analyze_scale_factor',
               'autovacuum_vacuum_cost_delay', 'autovacuum_vacuum_cost_limit',
               'vacuum_cost_limit', 'vacuum_cost_delay', 'vacuum_cost_page_hit', 'vacuum_cost_page_miss', 'vacuum_cost_page_dirty')
ORDER BY name;

-- @step T1 "the freezing ages, for transaction ids and for MultiXacts."
SELECT name, setting
FROM pg_settings
WHERE name IN ('vacuum_freeze_min_age', 'vacuum_freeze_table_age', 'autovacuum_freeze_max_age', 'vacuum_failsafe_age',
               'vacuum_multixact_freeze_min_age', 'vacuum_multixact_freeze_table_age',
               'autovacuum_multixact_freeze_max_age', 'vacuum_multixact_failsafe_age')
ORDER BY name;
