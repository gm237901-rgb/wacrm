-- ============================================================
-- 039_companies.sql — Companies (Empresas)
--
-- Lightweight companies entity for the new sidebar nav. Contacts may
-- optionally link to a real company via `company_id`; the existing
-- free-text `contacts.company` column is left untouched (no backfill)
-- so no existing data is touched or risked.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  phone TEXT,
  notes TEXT,
  -- Responsible agent. FK to profiles.id (not auth.users.id), same
  -- convention as deals.assigned_to / events.assigned_to.
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_account ON companies(account_id);
CREATE INDEX IF NOT EXISTS idx_companies_assigned ON companies(assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select ON companies;
CREATE POLICY companies_select ON companies FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS companies_insert ON companies;
CREATE POLICY companies_insert ON companies FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS companies_update ON companies;
CREATE POLICY companies_update ON companies FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS companies_delete ON companies;
CREATE POLICY companies_delete ON companies FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON companies;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- contacts.company_id — optional link to a real company. The
-- existing free-text `contacts.company` column stays as-is; this is
-- purely additive, not a migration of existing data.
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id) WHERE company_id IS NOT NULL;
