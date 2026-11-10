-- @title errors inside a PL/pgSQL loop, with and without an exception block, and a batch job with and without COMMIT
-- @engine pglite
-- @each

-- the switches on writes/plpgsql read these.

-- @step T1 "a table with a rule: qty must be positive."
CREATE TABLE stock (sku text PRIMARY KEY, qty int NOT NULL CHECK (qty > 0));

-- @step T1 errors=23514 "no exception block: the seventh insert breaks the CHECK, the error ends the DO block, and the six rows before it go with it."
DO $$
BEGIN
  FOR i IN 1..10 LOOP
    INSERT INTO stock VALUES ('TEA-' || i, i % 7);
  END LOOP;
END $$;

-- @step T1 "nothing was kept."
SELECT count(*) AS rows FROM stock;

-- @step T1 "an exception block around each insert: the bad row is rolled back to the block's start and skipped, the loop goes on."
DO $$
BEGIN
  FOR i IN 1..10 LOOP
    BEGIN
      INSERT INTO stock VALUES ('TEA-' || i, i % 7);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'skipped TEA-%', i;
    END;
  END LOOP;
END $$;

-- @step T1 "nine rows kept, one skipped."
SELECT count(*) AS rows FROM stock;

-- @step T1 "a batch job: 5,000 orders to archive, one of which (3,500) is broken."
CREATE TABLE jobs (id int PRIMARY KEY, archived boolean NOT NULL DEFAULT false);
INSERT INTO jobs (id) SELECT g FROM generate_series(1, 5000) AS g;

-- @step T1 "a procedure that works in batches of 1,000, with no COMMIT."
CREATE PROCEDURE archive_all() LANGUAGE plpgsql AS $$
BEGIN
  FOR batch IN 0..4 LOOP
    UPDATE jobs SET archived = true
    WHERE id > batch * 1000 AND id <= (batch + 1) * 1000;
    IF EXISTS (SELECT FROM jobs WHERE id = 3500 AND archived) THEN
      RAISE EXCEPTION 'order 3500 is broken';
    END IF;
  END LOOP;
END $$;

-- @step T1 errors=P0001 "it fails in the fourth batch, and the whole CALL is one transaction: everything rolls back."
CALL archive_all();

-- @step T1 "archived after the failure."
SELECT count(*) FILTER (WHERE archived) AS archived FROM jobs;

-- @step T1 "the same procedure with a COMMIT after every batch."
CREATE OR REPLACE PROCEDURE archive_all() LANGUAGE plpgsql AS $$
BEGIN
  FOR batch IN 0..4 LOOP
    UPDATE jobs SET archived = true
    WHERE id > batch * 1000 AND id <= (batch + 1) * 1000;
    IF EXISTS (SELECT FROM jobs WHERE id = 3500 AND archived) THEN
      RAISE EXCEPTION 'order 3500 is broken';
    END IF;
    COMMIT;
  END LOOP;
END $$;

-- @step T1 errors=P0001 "it fails in the same place. but the first three batches were committed as they finished, so they stay done."
CALL archive_all();

-- @step T1 "archived after the failure."
SELECT count(*) FILTER (WHERE archived) AS archived FROM jobs;
