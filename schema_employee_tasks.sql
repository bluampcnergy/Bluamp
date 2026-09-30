-- ============================================================
-- SUPABASE MIGRATION: Employee Tasks & Operational Log Setup
-- Date: 2026-07-23
-- Context: Provisioning database tables for Employee Task Management,
--   digital signatures on Bills of Materials, and activity logging.
-- ============================================================

-- 1. Create employee_tasks Table
CREATE TABLE IF NOT EXISTS employee_tasks (
    id TEXT PRIMARY KEY,
    assigned_to TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    completed BOOLEAN DEFAULT FALSE,
    due_date TEXT,
    created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    created_by TEXT NOT NULL
);

-- Enable RLS and add public access policy (or adjust per security requirements)
ALTER TABLE employee_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read employee_tasks" 
    ON employee_tasks FOR SELECT 
    USING (true);

CREATE POLICY "Allow anonymous insert employee_tasks" 
    ON employee_tasks FOR INSERT 
    WITH CHECK (true);

CREATE POLICY "Allow anonymous update employee_tasks" 
    ON employee_tasks FOR UPDATE 
    USING (true);

CREATE POLICY "Allow anonymous delete employee_tasks" 
    ON employee_tasks FOR DELETE 
    USING (true);

-- 2. Seed Initial Operational Tasks
INSERT INTO employee_tasks (id, assigned_to, title, description, completed, due_date, created_at, created_by)
VALUES 
    ('task-seed-1', 'chitale', 'Inspect Incoming Prismatic Cells', 'Check voltage, physical casing, and terminal resistance on 100Ah cell batch.', false, '2026-07-25', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'admin'),
    ('task-seed-2', 'chitale', 'Battery Pack Discharge Capacity Audit', 'Conduct 1C rate discharge cycle test on assembled 48V 100Ah packs.', false, '2026-07-26', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'admin'),
    ('task-seed-3', 'datlioncnergy@gmail.com', 'BOM Printing & Serial Signature Audit', 'Verify digital signatures and printed serial numbers for outgoing dealer orders.', false, '2026-07-27', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'admin'),
    ('task-seed-4', 'general', 'Warehouse Bin Location Mapping', 'Update storage unit bin tags for new BMS module arrivals.', false, '2026-07-28', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'admin')
ON CONFLICT (id) DO NOTHING;

-- 3. Ensure logs table has user digital signature tracking (Optional audit schema)
CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT
);

ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous full access logs" 
    ON logs FOR ALL 
    USING (true)
    WITH CHECK (true);
