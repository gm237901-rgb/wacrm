-- ============================================================
-- 046_waha_config.sql — WAHA (WhatsApp HTTP API) connection
--
-- Adds a second, much simpler way to connect WhatsApp: scan a QR code
-- from WhatsApp on your phone, instead of registering a Meta app,
-- verifying a business, and pasting API credentials.
--
-- This does NOT replace `whatsapp_config` (Meta Cloud API). Both can
-- exist; `accounts.wa_provider` decides which one outbound sends use,
-- so an account already working on Meta keeps working untouched.
--
-- One WAHA session per account, hosted on a shared WAHA server whose
-- base URL is operator-level config (env), not per-tenant — tenants
-- only own their session, never the server address.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS waha_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- WAHA session name. Derived from account_id so it's stable and
  -- collision-free across tenants on the shared server.
  session_name TEXT NOT NULL,
  -- Last known session state, mirrored from WAHA so the UI can render
  -- without a round trip. WAHA's own vocabulary, plus our initial
  -- 'STOPPED' default.
  status TEXT NOT NULL DEFAULT 'STOPPED'
    CHECK (status IN ('STOPPED', 'STARTING', 'SCAN_QR_CODE', 'WORKING', 'FAILED')),
  -- The connected WhatsApp number (E.164), populated once the session
  -- reaches WORKING. Null while unpaired.
  phone_number TEXT,
  -- Per-account secret the inbound webhook must present. Lets us reject
  -- forged webhook calls without trusting the payload's own session id.
  webhook_secret TEXT NOT NULL,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One WAHA session per account (mirrors whatsapp_config's constraint).
CREATE UNIQUE INDEX IF NOT EXISTS idx_waha_config_account ON waha_config(account_id);
-- The webhook resolves an inbound event back to its account by session
-- name, so that lookup must be indexed and unique server-wide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_waha_config_session ON waha_config(session_name);

ALTER TABLE waha_config ENABLE ROW LEVEL SECURITY;

-- Settings-class: any member reads (to see connection state), admin+
-- writes (connecting/disconnecting WhatsApp is an account-wide action).
-- Matches whatsapp_config's policy tier exactly.
DROP POLICY IF EXISTS waha_config_select ON waha_config;
CREATE POLICY waha_config_select ON waha_config FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS waha_config_insert ON waha_config;
CREATE POLICY waha_config_insert ON waha_config FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS waha_config_update ON waha_config;
CREATE POLICY waha_config_update ON waha_config FOR UPDATE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS waha_config_delete ON waha_config;
CREATE POLICY waha_config_delete ON waha_config FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON waha_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON waha_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Which provider sends outbound messages for this account.
-- 'meta' keeps today's behaviour for every existing account; only an
-- account that completes a WAHA pairing flips to 'waha'.
-- ============================================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS wa_provider TEXT NOT NULL DEFAULT 'meta';

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_wa_provider_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_wa_provider_check
  CHECK (wa_provider IN ('meta', 'waha'));
