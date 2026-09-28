-- =========================================================================
-- SQL MIGRATION: RAW MATERIAL UNIT COSTS & BOM SKU PRICING
-- Target Tables: received_goods, recipes
-- Instructions: Run this script directly in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql/new
-- =========================================================================

-- 1. Add 'unit_cost' column to received_goods (Excl. GST)
-- This column stores the internal purchase unit cost manually entered by Director Admins.
ALTER TABLE received_goods 
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2) DEFAULT 0;

-- 2. Initialize all existing records with 0 so the system starts fresh
UPDATE received_goods 
SET unit_cost = 0 
WHERE unit_cost IS NULL;

-- 3. Add costing & margin fields to recipes table for SKU BOM Pricing
-- Stores internal labor, packaging, custom margins, and tax parameters.
ALTER TABLE recipes 
ADD COLUMN IF NOT EXISTS "overheadCost" NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "packagingCost" NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "customMarginPercent" NUMERIC(6, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "dealerMarginPercent" NUMERIC(6, 2) DEFAULT 30,
ADD COLUMN IF NOT EXISTS "retailMarginPercent" NUMERIC(6, 2) DEFAULT 50,
ADD COLUMN IF NOT EXISTS "gstRate" NUMERIC(6, 2) DEFAULT 18;

-- 4. Comments for database schema documentation
COMMENT ON COLUMN received_goods.unit_cost IS 'Internal purchase unit cost excluding GST. Restricted to Director Admins in application UI.';
COMMENT ON COLUMN recipes."overheadCost" IS 'Internal labor & assembly overhead cost per SKU unit (Excl. GST).';
COMMENT ON COLUMN recipes."packagingCost" IS 'Packaging and casing materials cost per SKU unit (Excl. GST).';
