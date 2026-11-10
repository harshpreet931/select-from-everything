-- @title a nightly job on two servers, kept to one run at a time with advisory lock 42
-- @sessions A B
-- @each locks

-- @step A "the nightly report starts on server A. it asks for advisory lock 42 without waiting: true, A has it."
SELECT pg_try_advisory_lock(42);

-- @step B "the same cron entry fires on server B a moment later. same question: false. someone else has it, so B skips tonight's run."
SELECT pg_try_advisory_lock(42);

-- @step A "A finishes the report and lets go of the lock."
SELECT pg_advisory_unlock(42);

-- @step B "if B asks now, it gets it."
SELECT pg_try_advisory_lock(42);

-- @step B "B is done too."
SELECT pg_advisory_unlock(42);

-- @step A "a different job would rather wait than skip. A takes lock 42 with pg_advisory_lock."
SELECT pg_advisory_lock(42);

-- @step B blocks "B asks with pg_advisory_lock too, and waits for A, like it would for a row."
SELECT pg_advisory_lock(42);

-- @step A "A unlocks. B's pg_advisory_lock returns, and B holds 42 now."
SELECT pg_advisory_unlock(42);
