-- ============================================================
-- 045_deals_realtime.sql — Live updates for deals
--
-- The Dashboard's KPI row, sales funnel and revenue chart now
-- subscribe to `deals` changes so marking a deal won/lost (or
-- creating/moving one) reflects immediately without a reload.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE deals;
  END IF;
END $$;
