-- ============================================================
-- MIGRATION: Add isDTF column to finished_goods
-- Date: 2026-06-16
-- Context: The DTF (Direct-to-Finished) pipeline creates 
--   finished goods with isDTF = true, but the column was never
--   added to the Supabase table. This caused upserts to fail
--   silently (PGRST204), making DTF items vanish on page reload.
--
-- NOTE: The app code (useSupabase.ts) already strips isDTF 
--   before upserting and re-derives it from the 'fin-dtf-' id 
--   prefix on load — so this migration is OPTIONAL but 
--   recommended for proper data integrity.
-- ============================================================

-- 1. Add the missing isDTF column
ALTER TABLE finished_goods
  ADD COLUMN IF NOT EXISTS "isDTF" boolean DEFAULT false;

-- 2. Backfill existing DTF items (those with id starting with 'fin-dtf-')
UPDATE finished_goods
  SET "isDTF" = true
  WHERE id LIKE 'fin-dtf-%' AND ("isDTF" IS NULL OR "isDTF" = false);
