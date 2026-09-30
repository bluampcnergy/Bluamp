-- SQL Migration: Standardize Raw Material Units of Measurement (UOM)
-- Target Table: received_goods

-- 1. Add 'uom' column if it does not exist (defaulting to 'qty')
ALTER TABLE received_goods 
ADD COLUMN IF NOT EXISTS uom TEXT DEFAULT 'qty';

-- 2. Update existing records where uom is NULL to 'qty' for backward compatibility
UPDATE received_goods 
SET uom = 'qty' 
WHERE uom IS NULL OR uom = '';

-- 3. (Optional) Add 'uom' column to recipes table if components store UOM independently
ALTER TABLE recipes 
ADD COLUMN IF NOT EXISTS uom TEXT DEFAULT 'qty';
