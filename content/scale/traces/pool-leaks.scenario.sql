-- @title two server connections behind a transaction pooler, and the session state that leaks between clients
-- @sessions c1 c2
-- @each

-- connections-and-pooling reads this file. c1 and c2 are two real server backends, the way a
-- pooler holds them. which client is "on" a connection is in the step notes: under transaction
-- pooling the pooler hands a connection to whoever starts the next transaction. no pooler runs
-- here; the sessions do exactly what a pooler would forward.

-- @setup
CREATE TABLE orders (id int PRIMARY KEY, total numeric(10,2) NOT NULL);
INSERT INTO orders VALUES (1, 19.99), (2, 5.00);

-- @step c1 "alice is on c1. she sets a statement timeout for her session, she thinks."
SET statement_timeout = '50ms';

-- @step c1 "still on c1, she prepares a statement to run later."
PREPARE order_total(int) AS SELECT total FROM orders WHERE id = $1;

-- @step c1 +locks "and takes a session-level advisory lock, as a mutex for a cron job."
SELECT pg_advisory_lock(42);

-- @step c1 "her transaction is over, so the pooler gives c1 to bob. bob never set a timeout, but he has alice's."
SHOW statement_timeout;

-- @step c2 errors=26000 "alice's next transaction lands on c2, which never saw her PREPARE."
EXECUTE order_total(1);

-- @step c2 +locks "she tries to release her lock from c2. there is nothing to release here: the lock belongs to c1."
SELECT pg_advisory_unlock(42);

-- @step c2 "and nobody else can take it, from any connection but c1, until c1 lets go."
SELECT pg_try_advisory_lock(42);

-- @step c1 +locks "what a pooler runs between clients in session mode (server_reset_query): DISCARD ALL wipes settings, prepared statements and session locks."
DISCARD ALL;

-- @step c1 "the next client on c1 starts clean."
SHOW statement_timeout;
