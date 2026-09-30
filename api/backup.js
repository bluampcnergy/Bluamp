import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES_TO_BACKUP = [
  'app_users',
  'received_goods',
  'recipes',
  'wip_items',
  'finished_goods',
  'repair_items',
  'test_results',
  'logs',
  'company_profiles',
  'storage_rooms',
  'storage_units',
  'storage_items',
  'supplies_records',
  'invoices',
  'invoice_templates',
  'price_list',
  'expenses',
  'solar_reports'
];

export default async function handler(req, res) {
  // Allow manual trigger via GET or POST, but protect with CRON_SECRET if it exists
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing.' });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    return res.status(500).json({ error: 'Gmail credentials missing.' });
  }

  try {
    const backupData = {};
    const timestamp = new Date().toISOString();

    for (const table of TABLES_TO_BACKUP) {
      // Use service role to bypass RLS and get all data
      const { data, error } = await supabase.from(table).select('*');
      if (!error) {
        backupData[table] = data;
      } else if (error.code !== '42P01') { 
        // Ignore "relation does not exist" errors in case some tables were removed
        console.error(`Error fetching ${table}:`, error);
      }
    }

    const backupJson = JSON.stringify(backupData, null, 2);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Datlion_Cnergy_Backup_${dateStr}.json`;

    // Configure Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    const targetEmail = process.env.BACKUP_EMAIL || process.env.GMAIL_USER;

    const mailOptions = {
      from: `"Datlion Cnergy Backup" <${process.env.GMAIL_USER}>`,
      to: targetEmail,
      subject: `🛡️ Automated Database Backup - ${dateStr}`,
      html: `
        <h2>Daily Database Backup</h2>
        <p>Attached is your automated JSON backup of the Datlion Cnergy database for <b>${dateStr}</b>.</p>
        <p><b>Total Tables Backed Up:</b> ${Object.keys(backupData).length}</p>
        <p><b>Timestamp:</b> ${timestamp}</p>
        <br/>
        <p><small>This is an automated system message from your Vercel deployment.</small></p>
      `,
      attachments: [
        {
          filename: filename,
          content: backupJson,
          contentType: 'application/json'
        }
      ]
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ success: true, message: `Backup emailed to ${targetEmail} successfully.` });
  } catch (error) {
    console.error('Backup Error:', error);
    return res.status(500).json({ error: 'Failed to process backup', details: error.message });
  }
}
