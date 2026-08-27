import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { extractInvoiceFromBufferWithGemini } from '../../services/invoiceExtractionCore';

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://supabase.cnergy.co.in';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
const supabase = createClient(supabaseUrl, supabaseKey);

// WhatsApp & Gemini API Keys
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'CNERGY_WA_INVOICE_HOOK_2026';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const ALLOWED_WHATSAPP_NUMBERS = (process.env.ALLOWED_WHATSAPP_NUMBERS || '')
  .split(',')
  .map(n => n.trim().replace(/\D/g, ''))
  .filter(Boolean);

// --- WhatsApp Helper: Send Text Message ---
async function sendWhatsAppMessage(recipientPhone: string, text: string, phoneNumberId?: string) {
  const phoneId = phoneNumberId || WHATSAPP_PHONE_NUMBER_ID;
  if (!WHATSAPP_ACCESS_TOKEN || !phoneId) {
    console.warn('[WhatsApp] Skipping send: WHATSAPP_ACCESS_TOKEN or PHONE_NUMBER_ID missing');
    return;
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: {
          preview_url: true,
          body: text
        }
      })
    });
  } catch (err: any) {
    console.error('[WhatsApp] Failed to send message to', recipientPhone, err.message);
  }
}

// --- WhatsApp Helper: Download Media Buffer ---
async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  // Step 1: Retrieve Media URL from Graph API
  const metaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
  });

  if (!metaRes.ok) {
    const errText = await metaRes.text();
    throw new Error(`Failed to get media URL (${metaRes.status}): ${errText}`);
  }

  const metaJson: any = await metaRes.json();
  const downloadUrl = metaJson.url;
  const mimeType = metaJson.mime_type || 'application/pdf';

  // Step 2: Download raw binary stream
  const mediaRes = await fetch(downloadUrl, {
    headers: {
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'User-Agent': 'curl/7.64.1'
    }
  });

  if (!mediaRes.ok) {
    throw new Error(`Failed to download media content (${mediaRes.status})`);
  }

  const arrayBuffer = await mediaRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType
  };
}

// --- Asynchronous Invoice Processing Pipeline ---
async function processInboundWhatsAppInvoice(
  senderPhone: string,
  senderName: string,
  mediaId: string,
  initialFilename: string,
  initialMimeType: string,
  phoneNumberId: string
) {
  try {
    console.log(`[WhatsApp Ingestion] Processing invoice from ${senderName} (${senderPhone}) - Media ID: ${mediaId}`);

    // 1. Download file buffer
    const { buffer: fileBuffer, mimeType } = await downloadWhatsAppMedia(mediaId);

    // 2. Upload file to Supabase Storage Bucket ('Invoices')
    const fileExt = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : 'jpg';
    const cleanFilename = (initialFilename || `wa_invoice_${Date.now()}.${fileExt}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `whatsapp_invoices/${Date.now()}_${cleanFilename}`;

    let publicFileUrl = '';
    const { error: uploadError } = await supabase.storage
      .from('Invoices')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage.from('Invoices').getPublicUrl(storagePath);
      publicFileUrl = publicUrlData?.publicUrl || '';
    } else {
      console.warn('[WhatsApp Ingestion] Storage upload notice:', uploadError.message);
    }

    // 3. Extract Invoice Data via Gemini 2.5 Flash
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured on the server');
    }

    const extracted: any = await extractInvoiceFromBufferWithGemini(fileBuffer, mimeType, GEMINI_API_KEY);

    // 4. Prepare Supabase Database Record
    const vendorName = extracted.issuer_details?.name || 'Vendor';
    const invNumber = extracted.invoice_metadata?.invoice_number || `WA-${Date.now()}`;
    const grandTotal = Number(extracted.totals?.grand_total) || 0;
    const expenseCategory = extracted.expense_category || 'other';

    const dbPayload = {
      document_type: extracted.document_type || 'invoice',
      source_type: extracted.source_type || 'purchase',
      filename: publicFileUrl || cleanFilename,
      image_link: publicFileUrl || null,
      issuer_details: extracted.issuer_details || {},
      receiver_details: extracted.receiver_details || {},
      invoice_metadata: {
        ...extracted.invoice_metadata,
        invoice_number: invNumber,
        expense_category: expenseCategory,
        ingested_via: 'whatsapp_cloud_api',
        sender_phone: senderPhone,
        sender_name: senderName
      },
      items: extracted.items || [],
      totals: extracted.totals || {},
      requires_review: Boolean(extracted.requires_review),
      uploaded_by: `whatsapp:${senderPhone}`
    };

    const { data: insertedRecord, error: dbError } = await supabase
      .from('invoices')
      .insert([dbPayload])
      .select()
      .single();

    if (dbError) {
      throw new Error(`Database save error: ${dbError.message}`);
    }

    // 5. Log audit trail
    try {
      await supabase.from('logs').insert([{
        action: 'WHATSAPP_INVOICE_INGESTED',
        details: `Invoice #${invNumber} for ₹${grandTotal.toLocaleString('en-IN')} ingested via WhatsApp from ${senderPhone}`
      }]);
    } catch (e) {}

    // 6. Send Rich WhatsApp Confirmation Message
    const appUrl = process.env.VITE_APP_URL || 'https://inventory.cnergy.co.in';
    const invoiceLink = `${appUrl}/?view=finance_dashboard`;
    const categoryLabel = expenseCategory.replace(/_/g, ' ').toUpperCase();
    const itemsCount = extracted.items?.length || 0;

    const confirmationMessage = `✅ *Invoice Recorded Successfully!*

📄 *Invoice #:* ${invNumber}
🏢 *Vendor:* ${vendorName}
💰 *Grand Total:* ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
📂 *Category:* ${categoryLabel}
📅 *Date:* ${extracted.invoice_metadata?.invoice_date || new Date().toISOString().split('T')[0]}
📦 *Line Items:* ${itemsCount} item${itemsCount !== 1 ? 's' : ''} extracted

🔗 *View in Finance Dashboard:*
${invoiceLink}`;

    await sendWhatsAppMessage(senderPhone, confirmationMessage, phoneNumberId);
    console.log(`[WhatsApp Ingestion] Finished processing invoice #${invNumber} for ${senderPhone}`);

  } catch (error: any) {
    console.error('[WhatsApp Ingestion] Pipeline Error:', error);
    const failureMessage = `⚠️ *Invoice Processing Alert*
We received your document, but encountered an issue during extraction:
_${error.message}_

The file has been retained. You can review or enter it manually at:
https://inventory.cnergy.co.in/?view=finance_upload`;

    await sendWhatsAppMessage(senderPhone, failureMessage, phoneNumberId);
  }
}

// --- Main Webhook Handler ---
export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- 1. GET Request: Meta Webhook Verification Handshake ---
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
      console.log('[WhatsApp Webhook] Handshake verified successfully!');
      return res.status(200).send(challenge);
    } else {
      console.warn('[WhatsApp Webhook] Handshake verification failed:', { mode, token });
      return res.status(403).json({ error: 'Verification failed' });
    }
  }

  // --- 2. POST Request: Incoming WhatsApp Events ---
  if (req.method === 'POST') {
    try {
      const body = req.body;

      if (!body || body.object !== 'whatsapp_business_account') {
        return res.status(200).send('EVENT_RECEIVED');
      }

      const entry = body.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const message = change?.messages?.[0];
      const contact = change?.contacts?.[0];
      const phoneNumberId = change?.metadata?.phone_number_id || '';

      // If no message in payload (e.g., status updates like 'delivered'/'read'), acknowledge and exit
      if (!message) {
        return res.status(200).send('EVENT_RECEIVED');
      }

      const senderPhone = message.from;
      const senderName = contact?.profile?.name || 'User';

      // Security: Check Whitelisted Numbers if configured
      if (ALLOWED_WHATSAPP_NUMBERS.length > 0) {
        const cleanSender = senderPhone.replace(/\D/g, '');
        const isAllowed = ALLOWED_WHATSAPP_NUMBERS.some(allowed => cleanSender.endsWith(allowed) || allowed.endsWith(cleanSender));

        if (!isAllowed) {
          console.warn(`[WhatsApp Webhook] Message rejected from unauthorized phone: ${senderPhone}`);
          return res.status(200).send('SENDER_NOT_AUTHORIZED');
        }
      }

      const messageType = message.type;

      // Check if attachment is a document or image
      if (messageType === 'document' || messageType === 'image') {
        const mediaId = message.document?.id || message.image?.id;
        const mimeType = message.document?.mime_type || message.image?.mime_type || 'application/pdf';
        const filename = message.document?.filename || (messageType === 'image' ? 'invoice_photo.jpg' : 'invoice.pdf');

        if (!mediaId) {
          return res.status(200).send('NO_MEDIA_ID');
        }

        // Send instant acknowledgement on WhatsApp
        sendWhatsAppMessage(
          senderPhone,
          `⏳ *Invoice Received!* Analyzing document with Cnergy AI OCR...`,
          phoneNumberId
        ).catch(() => {});

        // Process extraction in background without blocking Meta webhook response
        waitUntil(
          processInboundWhatsAppInvoice(
            senderPhone,
            senderName,
            mediaId,
            filename,
            mimeType,
            phoneNumberId
          )
        );

        return res.status(200).send('EVENT_RECEIVED');
      }

      // If user sends plain text (e.g. "help" or greeting)
      if (messageType === 'text') {
        const userText = (message.text?.body || '').trim().toLowerCase();
        if (userText === 'help' || userText === 'hi' || userText === 'hello') {
          const helpText = `👋 *Datlion Cnergy Invoice Bot*

Send or forward any *Invoice PDF* or *Bill photo* to this chat.
Our AI will automatically:
• Extract vendor, invoice #, and GST items
• Tag expense category
• Save it to your plant finance ledger

🔗 Open Dashboard: https://inventory.cnergy.co.in/?view=finance_dashboard`;

          sendWhatsAppMessage(senderPhone, helpText, phoneNumberId).catch(() => {});
        }
      }

      return res.status(200).send('EVENT_RECEIVED');
    } catch (err: any) {
      console.error('[WhatsApp Webhook] Error:', err);
      return res.status(200).send('EVENT_RECEIVED');
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
