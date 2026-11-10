-- @title triggers on bank: who fires when, an audit table, 20,000 rows row by row or all at once, and skipping no-op updates
-- @engine pglite
-- @db bank
-- @each

-- the figures on writes/triggers read these.

-- @step T1 "a transaction, so the firing-order triggers disappear afterwards."
BEGIN;

-- @step T1 "four triggers on accounts that all write to one log: before and after, statement and row."
CREATE TABLE fired (seq int GENERATED ALWAYS AS IDENTITY, trigger_when text, level text, account int);
CREATE FUNCTION log_fire() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO fired (trigger_when, level, account)
  VALUES (TG_WHEN, TG_LEVEL, CASE WHEN TG_LEVEL = 'ROW' THEN NEW.id END);
  IF TG_LEVEL = 'ROW' AND TG_WHEN = 'BEFORE' THEN RETURN NEW; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER before_stmt BEFORE UPDATE ON accounts FOR EACH STATEMENT EXECUTE FUNCTION log_fire();
CREATE TRIGGER before_row  BEFORE UPDATE ON accounts FOR EACH ROW       EXECUTE FUNCTION log_fire();
CREATE TRIGGER after_row   AFTER  UPDATE ON accounts FOR EACH ROW       EXECUTE FUNCTION log_fire();
CREATE TRIGGER after_stmt  AFTER  UPDATE ON accounts FOR EACH STATEMENT EXECUTE FUNCTION log_fire();

-- @step T1 "one UPDATE of three rows."
UPDATE accounts SET balance = balance + 1 WHERE id IN (1, 2, 3);

-- @step T1 "the order they fired in."
SELECT seq, trigger_when, level, account FROM fired ORDER BY seq;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "an audit table, and a row trigger that writes to it on every insert, update and delete."
CREATE TABLE accounts_audit (
  id          int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  int NOT NULL,
  op          text NOT NULL,
  old_balance numeric(12,2),
  new_balance numeric(12,2)
);
CREATE FUNCTION audit_accounts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO accounts_audit (account_id, op, old_balance) VALUES (OLD.id, TG_OP, OLD.balance);
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO accounts_audit (account_id, op, new_balance) VALUES (NEW.id, TG_OP, NEW.balance);
  ELSE
    INSERT INTO accounts_audit (account_id, op, old_balance, new_balance) VALUES (NEW.id, TG_OP, OLD.balance, NEW.balance);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON accounts
FOR EACH ROW EXECUTE FUNCTION audit_accounts();

-- @step T1 "the audit table starts empty."
SELECT id, account_id, op, old_balance, new_balance FROM accounts_audit ORDER BY id;

-- @step T1 "alice pays bob 50.00, in one statement that updates two rows. the trigger fires once per row."
UPDATE accounts SET balance = balance + CASE id WHEN 1 THEN -50.00 ELSE 50.00 END
WHERE id IN (1, 2);

-- @step T1 "two audit rows, old and new balance side by side."
SELECT id, account_id, op, old_balance, new_balance FROM accounts_audit ORDER BY id;

-- @step T1 "carol closes her account."
DELETE FROM accounts WHERE id = 3;

-- @step T1 "a DELETE has only an old row."
SELECT id, account_id, op, old_balance, new_balance FROM accounts_audit ORDER BY id;

-- @step T1 "erin opens one."
INSERT INTO accounts (id, owner, opening_balance, balance, opened_at)
VALUES (1001, 'erin', 25.00, 25.00, '2026-05-01 10:00+00');

-- @step T1 "an INSERT has only a new row."
SELECT id, account_id, op, old_balance, new_balance FROM accounts_audit ORDER BY id;

-- @step T1 "the audit trigger goes, so the next scenes don't write to it."
DROP TRIGGER audit ON accounts;

-- @step T1 "a transaction for the row-trigger run."
BEGIN;

-- @step T1 "a row-level trigger on transfers that copies every changed row into an audit table, and counts its own calls."
CREATE SEQUENCE trigger_calls;
CREATE TABLE transfers_audit (transfer_id bigint, old_amount numeric(12,2), new_amount numeric(12,2));
CREATE FUNCTION audit_transfer_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nextval('trigger_calls');
  INSERT INTO transfers_audit VALUES (OLD.id, OLD.amount, NEW.amount);
  RETURN NULL;
END $$;
CREATE TRIGGER audit_transfers AFTER UPDATE ON transfers
FOR EACH ROW EXECUTE FUNCTION audit_transfer_row();

-- @step T1 "every transfer, 20,000 rows."
UPDATE transfers SET amount = amount + 1;

-- @step T1 "the trigger function ran 20,000 times, and ran 20,000 single-row INSERTs."
SELECT nextval('trigger_calls') - 1 AS calls, (SELECT count(*) FROM transfers_audit) AS audit_rows;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "a transaction for the statement-trigger run."
BEGIN;

-- @step T1 "the same audit as a statement-level trigger: REFERENCING gives it every old and new row of the statement as two tables."
CREATE SEQUENCE trigger_calls;
CREATE TABLE transfers_audit (transfer_id bigint, old_amount numeric(12,2), new_amount numeric(12,2));
CREATE FUNCTION audit_transfer_stmt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nextval('trigger_calls');
  INSERT INTO transfers_audit
  SELECT o.id, o.amount, n.amount FROM old_rows AS o JOIN new_rows AS n USING (id);
  RETURN NULL;
END $$;
CREATE TRIGGER audit_transfers AFTER UPDATE ON transfers
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION audit_transfer_stmt();

-- @step T1 "every transfer, 20,000 rows."
UPDATE transfers SET amount = amount + 1;

-- @step T1 "one call, one INSERT ... SELECT, the same 20,000 audit rows."
SELECT nextval('trigger_calls') - 1 AS calls, (SELECT count(*) FROM transfers_audit) AS audit_rows;

-- @step T1 "undo."
ROLLBACK;

-- @step T1 "three accounts: where each version lives (ctid) and which transaction wrote it (xmin)."
SELECT id, currency, ctid, xmin FROM accounts WHERE id IN (1, 2, 4) ORDER BY id;

-- @step T1 "an UPDATE that changes nothing: currency = currency, on every account."
UPDATE accounts SET currency = currency;

-- @step T1 "every row has a new ctid and a new xmin anyway: a whole new version was written, 1,000 times."
SELECT id, currency, ctid, xmin FROM accounts WHERE id IN (1, 2, 4) ORDER BY id;

-- @step T1 "a BEFORE UPDATE trigger running the built-in suppress_redundant_updates_trigger()."
CREATE TRIGGER skip_noop BEFORE UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION suppress_redundant_updates_trigger();

-- @step T1 "the same no-op UPDATE. the trigger sees new = old, returns NULL, and the row is skipped. UPDATE 0."
UPDATE accounts SET currency = currency;

-- @step T1 "nothing written: same ctids, same xmins."
SELECT id, currency, ctid, xmin FROM accounts WHERE id IN (1, 2, 4) ORDER BY id;

-- @step T1 "a real change still goes through."
UPDATE accounts SET currency = 'USD' WHERE id = 4;

-- @step T1 "one new version, for dave."
SELECT id, currency, ctid, xmin FROM accounts WHERE id IN (1, 2, 4) ORDER BY id;
