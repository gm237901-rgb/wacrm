-- ============================================================
-- 038_default_currency_brl
--
-- Switch this deployment's default deal currency to BRL.
--
-- Migration 021 made the default currency configurable per account,
-- but new accounts still inherited the column default of 'USD'. This
-- deployment is run for a Brazilian business, so both the column
-- default for accounts created from now on, and every existing
-- account still sitting on the untouched 'USD' default, move to BRL.
-- Accounts that already picked a currency explicitly (via Settings)
-- are left alone.
-- ============================================================

ALTER TABLE accounts
  ALTER COLUMN default_currency SET DEFAULT 'BRL';

UPDATE accounts
  SET default_currency = 'BRL'
  WHERE default_currency = 'USD';
