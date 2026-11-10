-- @title three clients, three backend processes, and the server's own helpers
-- @sessions A B C
-- @each

-- connections-and-pooling reads this file. a native server, because the browser's postgres is
-- one process with one session. pids change every run, so the figure shows which process each
-- row is (pgtrace names a session's pid after the session), not the numbers.

-- @step A "client A connects. its backend asks what else is running on the server."
SELECT backend_type, count(*) AS processes
FROM pg_stat_activity
GROUP BY backend_type
ORDER BY backend_type;

-- @step B "client B asks which backend it is talking to."
SELECT pid = pg_backend_pid() AS mine, application_name, backend_type, state
FROM pg_stat_activity
WHERE backend_type = 'client backend'
ORDER BY application_name;

-- @step C "client C asks how much private memory its brand-new backend has allocated."
SELECT count(*) AS contexts,
       round(sum(total_bytes) / 1024.0 / 1024.0, 1) AS allocated_mb,
       round(sum(used_bytes) / 1024.0 / 1024.0, 1) AS used_mb
FROM pg_backend_memory_contexts;

-- @step A "the limit, and how many slots are kept back for superusers."
SELECT name, setting FROM pg_settings
WHERE name IN ('max_connections', 'superuser_reserved_connections', 'reserved_connections')
ORDER BY name;
