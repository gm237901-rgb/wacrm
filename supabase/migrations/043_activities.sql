-- ============================================================
-- 043_activities.sql — Activities (Atividades)
--
-- Logged interaction history (calls, meetings, notes) tied to a
-- contact and/or deal — distinct from `events` (scheduled/future
-- calendar items) and `tasks` (pending to-dos). An activity records
-- something that already happened, so there's no updated_at/edit
-- workflow — it's a log, like automation_logs.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note' CHECK (type IN ('call', 'meeting', 'note', 'email')),
  summary TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_account ON activities(account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id) WHERE deal_id IS NOT NULL;

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activities_select ON activities;
CREATE POLICY activities_select ON activities FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS activities_insert ON activities;
CREATE POLICY activities_insert ON activities FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS activities_update ON activities;
CREATE POLICY activities_update ON activities FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS activities_delete ON activities;
CREATE POLICY activities_delete ON activities FOR DELETE USING (is_account_member(account_id, 'agent'));
