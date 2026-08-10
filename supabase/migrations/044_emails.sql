-- ============================================================
-- 044_emails.sql — E-mails (manual log only)
--
-- Records that an email was exchanged with a contact/deal. This is
-- explicitly NOT a send/receive integration — no provider is wired
-- up. Entries are logged manually until a real email channel/provider
-- is decided on.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  logged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_contact ON emails(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_deal ON emails(deal_id) WHERE deal_id IS NOT NULL;

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emails_select ON emails;
CREATE POLICY emails_select ON emails FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS emails_insert ON emails;
CREATE POLICY emails_insert ON emails FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS emails_update ON emails;
CREATE POLICY emails_update ON emails FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS emails_delete ON emails;
CREATE POLICY emails_delete ON emails FOR DELETE USING (is_account_member(account_id, 'agent'));
