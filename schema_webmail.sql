-- ====================================================================
-- SUPABASE MIGRATION: Webmail Accounts Per-User Storage
-- Table: webmail_accounts
-- Allows each user to save their custom IMAP/SMTP accounts & passwords safely.
-- ====================================================================

CREATE TABLE IF NOT EXISTS webmail_accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    sender_name TEXT,
    imap_host TEXT NOT NULL DEFAULT 'mail.cnergy.co.in',
    imap_port INTEGER DEFAULT 993,
    smtp_host TEXT NOT NULL DEFAULT 'mail.cnergy.co.in',
    smtp_port INTEGER DEFAULT 465,
    auth_username TEXT NOT NULL,
    auth_password TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Enable RLS and add public access policy
ALTER TABLE webmail_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access webmail_accounts" ON webmail_accounts;
CREATE POLICY "Allow all access webmail_accounts" 
    ON webmail_accounts FOR ALL 
    USING (true)
    WITH CHECK (true);
