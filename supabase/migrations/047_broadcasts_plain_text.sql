-- ============================================================
-- 047_broadcasts_plain_text.sql — Plain-text broadcasts (WAHA)
--
-- Meta broadcasts are built on approved message templates, a concept
-- that doesn't exist on a QR-paired session. Without this, a WAHA-only
-- account can't use broadcasts at all.
--
-- template_name/template_language become optional, and a broadcast must
-- carry exactly one of the two shapes: a template (Meta) or a body
-- (WAHA). The CHECK is what stops a half-built row reaching delivery.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS message_text TEXT;

ALTER TABLE broadcasts ALTER COLUMN template_name DROP NOT NULL;
ALTER TABLE broadcasts ALTER COLUMN template_language DROP NOT NULL;

ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_body_or_template;
ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_body_or_template
  CHECK (
    (template_name IS NOT NULL AND length(trim(template_name)) > 0)
    OR
    (message_text IS NOT NULL AND length(trim(message_text)) > 0)
  );
