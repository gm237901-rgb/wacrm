-- ============================================================
-- 042_tasks.sql — Tasks (Tarefas)
--
-- Simple to-do list, distinct from `events` (migration 037 —
-- scheduled calendar items with a time range): tasks are pending
-- work items with just a due date, no time-range/all-day concept.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_account ON tasks(account_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deal ON tasks(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select ON tasks;
CREATE POLICY tasks_select ON tasks FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS tasks_insert ON tasks;
CREATE POLICY tasks_insert ON tasks FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS tasks_update ON tasks;
CREATE POLICY tasks_update ON tasks FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS tasks_delete ON tasks;
CREATE POLICY tasks_delete ON tasks FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON tasks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
