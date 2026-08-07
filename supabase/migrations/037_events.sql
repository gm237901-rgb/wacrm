-- ============================================================
-- 037_events.sql — Agenda: contact/deal-linked calendar events
--
-- Adds a lightweight calendar so agents can schedule follow-ups tied
-- to a contact and/or a deal ("call João on the 5th"). Assigning an
-- event to a teammate fires a notification, reusing the same
-- delivery mechanism as conversation assignment (migration 027) so
-- both surfaces share one notifications feed.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Author / audit only, mirrors deals.user_id — never used for tenancy.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Responsible agent. FK to profiles.id (not auth.users.id) — same
  -- convention as deals.assigned_to (migration 002) — so this embeds
  -- via `profiles!events_assigned_to_fkey` in PostgREST selects.
  -- Nullable = unassigned (shows in everyone's agenda).
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Optional links. SET NULL on delete (same pattern as deals.contact_id,
  -- migration 004) so history survives the contact/deal being removed.
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Calendar month/day views query by account + date range — this is the
-- hot path.
CREATE INDEX IF NOT EXISTS idx_events_account_starts ON events(account_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_contact ON events(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_deal ON events(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_assigned ON events(assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Operational data (like contacts/deals): any member reads, agent+ writes.
DROP POLICY IF EXISTS events_select ON events;
CREATE POLICY events_select ON events FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS events_insert ON events;
CREATE POLICY events_insert ON events FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS events_update ON events;
CREATE POLICY events_update ON events FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS events_delete ON events;
CREATE POLICY events_delete ON events FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON events;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Notifications — widen `type` to add 'event_assigned' and add the
-- event_id column the notification points at (mirrors conversation_id's
-- role for conversation_assigned, migration 027).
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'event_assigned'));

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION notify_event_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name TEXT;
  -- events.assigned_to holds profiles.id; notifications.user_id needs
  -- the underlying auth.users.id, so resolve it via profiles first.
  v_assignee_user_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.assigned_to IS NULL
       OR NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT user_id INTO v_assignee_user_id FROM profiles WHERE id = NEW.assigned_to;
  IF v_assignee_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip self-assignment — nothing to notify the agent about.
  IF auth.uid() IS NOT NULL AND auth.uid() = v_assignee_user_id THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT full_name INTO v_actor_name FROM profiles WHERE user_id = auth.uid();
  END IF;

  INSERT INTO notifications (
    account_id, user_id, type, event_id, contact_id,
    actor_user_id, title, body
  ) VALUES (
    NEW.account_id,
    v_assignee_user_id,
    'event_assigned',
    NEW.id,
    NEW.contact_id,
    auth.uid(),
    'Novo compromisso atribuído',
    COALESCE(v_actor_name, 'Alguém') || ' atribuiu a você o compromisso "' || NEW.title || '"'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a notification failure block the assignment itself.
  RAISE WARNING 'Failed to create event-assignment notification for event %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_event_assigned() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_event_assigned ON events;
CREATE TRIGGER on_event_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON events
  FOR EACH ROW EXECUTE FUNCTION notify_event_assigned();

-- ============================================================
-- Realtime — the agenda page and the contact-detail "Agenda" tab both
-- want live updates without a manual refresh.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
  END IF;
END $$;
