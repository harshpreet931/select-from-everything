-- @title a price history kept by a trigger, with a tstzrange saying when each price was true
-- @engine pglite
-- @each

-- history-and-soft-delete reads these: the versions for the RangeLine, and four "as of" reads.

-- @step T1 "prices, plus a history table. the trigger closes the old version and opens a new one on every change. it reads its clock from app.clock, so this page's output is stable; in production it would be now()."
SET TimeZone = 'UTC';
CREATE TABLE prices (sku text PRIMARY KEY, price numeric(8,2) NOT NULL);
CREATE TABLE price_history (sku text NOT NULL, price numeric(8,2) NOT NULL, valid tstzrange NOT NULL);
CREATE FUNCTION keep_price_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t timestamptz := coalesce(current_setting('app.clock', true)::timestamptz, now());
BEGIN
  IF TG_OP = 'UPDATE' THEN
    UPDATE price_history SET valid = tstzrange(lower(valid), t)
    WHERE sku = OLD.sku AND upper_inf(valid);
  END IF;
  INSERT INTO price_history VALUES (NEW.sku, NEW.price, tstzrange(t, NULL));
  RETURN NEW;
END $$;
CREATE TRIGGER prices_history AFTER INSERT OR UPDATE OF price ON prices
FOR EACH ROW EXECUTE FUNCTION keep_price_history();

-- @step T1 "assam tea goes on sale on march 1 at 6.50."
SET app.clock = '2026-03-01 00:00+00';
INSERT INTO prices VALUES ('TEA-01', 6.50);

-- @step T1 "a price rise on march 12."
SET app.clock = '2026-03-12 00:00+00';
UPDATE prices SET price = 7.25 WHERE sku = 'TEA-01';

-- @step T1 "a sale from march 20."
SET app.clock = '2026-03-20 00:00+00';
UPDATE prices SET price = 5.95 WHERE sku = 'TEA-01';

-- @step T1 "back up on april 1."
SET app.clock = '2026-04-01 00:00+00';
UPDATE prices SET price = 7.25 WHERE sku = 'TEA-01';

-- @step T1 "the history: four versions, each valid from one change to the next. the last one is open-ended."
SELECT price, lower(valid)::date AS valid_from, upper(valid)::date AS valid_to FROM price_history ORDER BY lower(valid);

-- @step T1 "as of march 5: the range that contains that instant."
SELECT sku, price FROM price_history WHERE sku = 'TEA-01' AND valid @> '2026-03-05 12:00+00'::timestamptz;

-- @step T1 "as of march 15."
SELECT sku, price FROM price_history WHERE sku = 'TEA-01' AND valid @> '2026-03-15 12:00+00'::timestamptz;

-- @step T1 "as of march 25."
SELECT sku, price FROM price_history WHERE sku = 'TEA-01' AND valid @> '2026-03-25 12:00+00'::timestamptz;

-- @step T1 "as of april 10, the open-ended version."
SELECT sku, price FROM price_history WHERE sku = 'TEA-01' AND valid @> '2026-04-10 12:00+00'::timestamptz;
