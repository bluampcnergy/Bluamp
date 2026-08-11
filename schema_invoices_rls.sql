-- ============================================================
-- SUPABASE MIGRATION: Invoices Table Row Level Security (RLS) & Permissions
-- Date: 2026-08-11
-- Context: Enable full read/write access (INSERT, UPDATE, SELECT, DELETE)
--   for all authenticated users (including 'billing' and 'dashboard_user' roles)
--   and anon requests on the `invoices` and `logs` tables.
-- ============================================================

-- 1. Enable RLS on invoices table
ALTER TABLE IF EXISTS invoices ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if present to avoid conflicts
DROP POLICY IF EXISTS "Allow all access on invoices" ON invoices;
DROP POLICY IF EXISTS "Allow anonymous read invoices" ON invoices;
DROP POLICY IF EXISTS "Allow anonymous insert invoices" ON invoices;
DROP POLICY IF EXISTS "Allow anonymous update invoices" ON invoices;

-- Create comprehensive policy allowing ALL operations for authenticated and anon users
CREATE POLICY "Allow all access on invoices"
  ON invoices
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Enable RLS on logs table (audit trail)
ALTER TABLE IF EXISTS logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access on logs" ON logs;

CREATE POLICY "Allow all access on logs"
  ON logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Grant explicit privileges on tables to anon, authenticated, and service_role
GRANT ALL ON TABLE invoices TO anon, authenticated, service_role;
GRANT ALL ON TABLE logs TO anon, authenticated, service_role;
