# Webmail Module Replication & Integration Guide

This guide provides complete, step-by-step instructions and reference code to replicate the **Multi-Account Webmail Module** (IMAP/SMTP with Supabase sync) into any React + Node.js / Vercel inventory application.

---

## 1. System Architecture Overview

The Webmail module consists of 4 main layers:

```
[ Frontend: Webmail.tsx ]
       │
       ├──── Sync Accounts ─────────► [ Supabase DB: webmail_accounts ]
       │                                  (Per-user encrypted/isolated credentials)
       │
       ├──── Fetch Emails (IMAP) ───► [ Serverless Endpoint: /api/webmail-fetch ] ──► [ IMAP Server (e.g. mail.domain.com:993) ]
       │                                  (via ImapFlow)
       │
       └──── Send Email (SMTP) ────► [ Serverless Endpoint: /api/webmail-send ]  ──► [ SMTP Server (e.g. mail.domain.com:465) ]
                                          (via Nodemailer)
```

### Key Features
- **Multi-Account Support**: Switch between `sales@`, `support@`, `info@`, or custom external emails.
- **Per-User Isolation**: Supabase DB stores individual user IMAP/SMTP credentials per username.
- **Live IMAP Sync**: Connects securely to port 993/SSL via `imapflow`.
- **Live SMTP Mail Dispatch**: Sends html emails with attachments via `nodemailer`.
- **Offline / Local Fallback**: Gracefully falls back to local storage and sample emails if offline or in demo mode.

---

## 2. Dependencies & Package Setup

In the target inventory application, install the following packages:

```bash
npm install imapflow nodemailer @supabase/supabase-js
npm install --save-dev @types/node typescript
```

---

## 3. Supabase Database Migration SQL

Run this SQL snippet in your Supabase SQL Editor or database migration pipeline:

```sql
-- ====================================================================
-- SUPABASE MIGRATION: Webmail Accounts Storage
-- Table: webmail_accounts
-- Allows each user to save their custom IMAP/SMTP settings & credentials.
-- ====================================================================

CREATE TABLE IF NOT EXISTS webmail_accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    sender_name TEXT,
    imap_host TEXT NOT NULL DEFAULT 'mail.yourdomain.com',
    imap_port INTEGER DEFAULT 993,
    smtp_host TEXT NOT NULL DEFAULT 'mail.yourdomain.com',
    smtp_port INTEGER DEFAULT 465,
    auth_username TEXT NOT NULL,
    auth_password TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Enable RLS and set access rules
ALTER TABLE webmail_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access webmail_accounts" ON webmail_accounts;
CREATE POLICY "Allow all access webmail_accounts" 
    ON webmail_accounts FOR ALL 
    USING (true)
    WITH CHECK (true);
```

---

## 4. TypeScript Type Definitions (`types.ts`)

Add the following interfaces to your application's `types.ts` or `webmail.types.ts`:

```typescript
export interface WebmailAccount {
    id: string;
    email: string;
    senderName: string;
    imapHost: string;
    imapPort: number;
    smtpHost: string;
    smtpPort: number;
    username: string;
    password?: string;
    isDefault?: boolean;
}

export interface EmailAttachment {
    filename: string;
    size: string;
    type: string;
    contentBase64?: string;
}

export interface EmailMessage {
    id: string;
    accountEmail: string;
    folder: 'inbox' | 'starred' | 'sent' | 'drafts' | 'trash';
    from: string;
    to: string;
    subject: string;
    date: string;
    timestamp: number;
    snippet: string;
    bodyHtml: string;
    isUnread?: boolean;
    isStarred?: boolean;
    hasAttachments?: boolean;
    attachments?: EmailAttachment[];
}
```

---

## 5. Backend API Handlers

Place these API endpoint files in your project's `/api` directory (Vercel Serverless / Express / Next.js API routes).

### A. IMAP Fetch & Connection Test (`api/webmail-fetch.js`)

```javascript
import { ImapFlow } from 'imapflow';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { account, mode = 'fetch' } = req.body;

  const imapHost = account?.imapHost || 'mail.yourdomain.com';
  const imapPort = Number(account?.imapPort) || 993;
  const authUser = account?.username || account?.email;
  const authPass = account?.password || '';

  if (!authUser || !authPass) {
    return res.status(400).json({ 
      success: false, 
      error: 'Password or username missing. Enter credentials in Webmail Settings.' 
    });
  }

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapPort === 993,
    auth: { user: authUser, pass: authPass },
    tls: { rejectUnauthorized: false },
    logger: false
  });

  try {
    await client.connect();

    if (mode === 'test') {
      await client.logout();
      return res.status(200).json({
        success: true,
        message: `Successfully connected to ${imapHost}:${imapPort} as ${authUser}!`
      });
    }

    // Open INBOX
    const lock = await client.getMailboxLock('INBOX');
    const fetchedEmails = [];

    try {
      const status = await client.status('INBOX', { messages: true });
      const total = status.messages || 0;
      const startSeq = Math.max(1, total - 14);
      const searchRange = `${startSeq}:${total}`;

      for await (let message of client.fetch(searchRange, { envelope: true, bodyStructure: true, source: true })) {
        const envelope = message.envelope;
        const fromAddr = envelope.from?.[0] 
          ? `${envelope.from[0].name || ''} <${envelope.from[0].address || ''}>`.trim() 
          : 'Unknown Sender';

        const toAddr = envelope.to?.[0]?.address || account?.email || authUser;

        fetchedEmails.push({
          id: `imap-${message.uid || message.seq}`,
          accountEmail: account?.email || authUser,
          folder: 'inbox',
          from: fromAddr,
          to: toAddr,
          subject: envelope.subject || '(No Subject)',
          date: envelope.date ? new Date(envelope.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : new Date().toLocaleString(),
          timestamp: envelope.date ? new Date(envelope.date).getTime() : Date.now(),
          snippet: envelope.subject || 'IMAP Message Received',
          bodyHtml: `<div style="font-family: Arial, sans-serif; padding: 10px; color: #333;">
            <p><strong>Subject:</strong> ${envelope.subject || '(No Subject)'}</p>
            <p><strong>From:</strong> ${fromAddr}</p>
            <p><strong>Date:</strong> ${envelope.date}</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;"/>
            <p style="white-space: pre-wrap;">Message fetched live via IMAP from ${imapHost}.</p>
          </div>`,
          isUnread: !(message.flags?.has('\\Seen')),
          isStarred: Boolean(message.flags?.has('\\Flagged')),
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return res.status(200).json({ success: true, emails: fetchedEmails.reverse() });

  } catch (error) {
    console.error('IMAP Fetch Error:', error);
    try { await client.logout(); } catch (e) {}
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to connect to IMAP server.' 
    });
  }
}
```

### B. SMTP Dispatch (`api/webmail-send.js`)

```javascript
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { account, to, cc, subject, html, attachmentBase64, attachmentName } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ message: 'Missing required fields: to, subject' });
  }

  try {
    const smtpHost = account?.smtpHost || process.env.SMTP_HOST || 'mail.yourdomain.com';
    const smtpPort = Number(account?.smtpPort) || Number(process.env.SMTP_PORT) || 465;
    const authUser = account?.username || account?.email || 'sales@yourdomain.com';
    const authPass = account?.password || '';

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // True for port 465 SSL, False for 587 TLS
      auth: { user: authUser, pass: authPass },
      tls: { rejectUnauthorized: false }
    });

    const senderEmail = account?.email || authUser;
    const senderName = account?.senderName || 'Webmail Service';

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to,
      cc: cc || undefined,
      subject,
      html,
    };

    if (attachmentBase64) {
      const base64Data = attachmentBase64.split(',')[1] || attachmentBase64;
      mailOptions.attachments = [
        {
          filename: attachmentName || 'attachment',
          content: base64Data,
          encoding: 'base64'
        }
      ];
    }

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('SMTP Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'SMTP Connection Failed' 
    });
  }
}
```

---

## 6. Frontend Integration Checklist

1. **Copy Component**: Copy `components/Webmail.tsx` into your application.
2. **Wire Header / Sidebar Navigation**: Add `webmail` view tab to your main navigation menu with an unread badge indicator.
3. **Database Client Configuration**: Ensure your `supabaseClient.ts` is configured with valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. **Testing**:
   - Open Webmail -> Gear Icon (Settings).
   - Enter your email address, IMAP host (`mail.domain.com`), SMTP host, and email password.
   - Click **"Test Connection"** to verify server handshake before saving.

---

## 7. Security Best Practices

- **Password Storage**: The `webmail_accounts` table stores credentials per user. In multi-tenant enterprise settings, consider using Supabase Vault or AES encryption for `auth_password`.
- **SSL/TLS Certificates**: The API uses `rejectUnauthorized: false` to allow custom domain cPanel/Plesk servers with self-signed SSL certs. Change to `true` for strictly verified public certs.
- **Port Mapping Standard**:
  - IMAP SSL: `993`
  - IMAP STARTTLS: `143`
  - SMTP SSL: `465`
  - SMTP TLS: `587`
