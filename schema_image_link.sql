-- ============================================================
-- MIGRATION: Add image_link column to invoices
-- Date: 2026-06-23
-- Context: The invoices table needs an image_link column to store 
--   a link to the invoice or receipt image (especially useful for expenses).
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS "image_link" text;
