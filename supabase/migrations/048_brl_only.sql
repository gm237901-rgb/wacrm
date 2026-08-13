-- ============================================================
-- 048_brl_only
--
-- Lock the whole deployment to Brazilian reais.
--
-- Migration 038 moved the *default* to BRL, but a default is only a
-- suggestion: `deals.currency` still accepted any 3-letter string, and
-- `accounts.default_currency` only checked the shape (^[A-Z]{3}$). An
-- import, an API client, or a hand-edited row could still write 'USD'.
--
-- That kind of value doesn't announce itself. It surfaces as a
-- pipeline total that's quietly wrong, because a dashboard SUM()s the
-- amount column and no query anywhere asks what currency the row was
-- in. So the constraint goes where the guarantee has to hold — in the
-- database, not in the form that happens to write to it.
--
-- The currency columns stay. A financial report should read the
-- currency explicitly rather than assume it; what changes is that
-- there is now exactly one value it can read.
-- ============================================================

-- ---------------------------------------------------------------
-- deals — the column that had no CHECK at all, and was created back
-- in 001 with a 'USD' default that outlived its usefulness.
-- ---------------------------------------------------------------
UPDATE deals
  SET currency = 'BRL'
  WHERE currency IS DISTINCT FROM 'BRL';

ALTER TABLE deals
  ALTER COLUMN currency SET DEFAULT 'BRL';

ALTER TABLE deals
  ALTER COLUMN currency SET NOT NULL;

ALTER TABLE deals
  DROP CONSTRAINT IF EXISTS deals_currency_brl;
ALTER TABLE deals
  ADD CONSTRAINT deals_currency_brl CHECK (currency = 'BRL');

-- ---------------------------------------------------------------
-- products — already defaulted to BRL (041), never constrained.
-- ---------------------------------------------------------------
UPDATE products
  SET currency = 'BRL'
  WHERE currency IS DISTINCT FROM 'BRL';

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_currency_brl;
ALTER TABLE products
  ADD CONSTRAINT products_currency_brl CHECK (currency = 'BRL');

-- ---------------------------------------------------------------
-- accounts — replace the shape-only check from 021. The Settings
-- picker that fed this column is gone; the column remains so existing
-- reads keep working.
-- ---------------------------------------------------------------
UPDATE accounts
  SET default_currency = 'BRL'
  WHERE default_currency IS DISTINCT FROM 'BRL';

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_default_currency_format;
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_default_currency_brl;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_default_currency_brl
  CHECK (default_currency = 'BRL');
