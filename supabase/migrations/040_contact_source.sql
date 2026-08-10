-- ============================================================
-- 040_contact_source.sql — Lead source on contacts
--
-- Powers the "Origem dos leads" dashboard donut with real data.
-- Nullable — existing contacts simply have no source until someone
-- classifies them (via the new selector on the contact form).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
  CHECK (source IS NULL OR source IN ('site', 'google_ads', 'indicacao', 'redes_sociais', 'outros'));

CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source) WHERE source IS NOT NULL;
