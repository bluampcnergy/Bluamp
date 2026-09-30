-- ============================================================
-- MIGRATION: Create expenses table for employee expense ledger
-- Date: 2026-06-23
-- Context: Standalone employee expense tracking system.
--   Separate from the invoices table. Supports credit/debit
--   entries per employee with running balance calculation.
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id text PRIMARY KEY,
  employee_name text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL CHECK (type IN ('debit', 'credit')),
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  image_link text,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fast employee-based filtering
CREATE INDEX IF NOT EXISTS idx_expenses_employee ON expenses (employee_name);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date DESC);

-- Enable Row Level Security (allow all for anon key, same pattern as other tables)
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access for anon" ON expenses
  FOR ALL
  USING (true)
  WITH CHECK (true);
