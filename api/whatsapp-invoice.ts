import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { waitUntil } from '@vercel/functions';

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://supabase.cnergy.co.in';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
const supabase = createClient(supabaseUrl, supabaseKey);

// WhatsApp & Gemini Configuration
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'CNERGY_WA_INVOICE_HOOK_2026';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.VITE_API_KEY || '';
const ALLOWED_WHATSAPP_NUMBERS = (process.env.ALLOWED_WHATSAPP_NUMBERS || '')
  .split(',')
  .map(n => n.trim().replace(/\D/g, ''))
  .filter(Boolean);

// Invoice Schema for Gemini 2.5 Flash
const invoiceSchema = {
  type: Type.OBJECT,
  properties: {
    document_type: { type: Type.STRING, enum: ["invoice", "receipt", "credit_note", "debit_note", "purchase_order", "bill", "other"] },
    source_type: { type: Type.STRING, enum: ["sales", "purchase"] },
    expense_category: {
      type: Type.STRING,
      enum: [
        "raw_materials",
        "battery_cells_bms",
        "logistics_transport",
        "utilities_electricity",
        "rent_facility",
        "tools_equipment",
        "office_supplies",
        "repairs_maintenance",
        "professional_services",
        "other"
      ]
    },
    issuer_details: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        gstin: { type: Type.STRING, nullable: true },
        address: { type: Type.STRING, nullable: true },
        state: { type: Type.STRING, nullable: true }
      }
    },
    receiver_details: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        gstin: { type: Type.STRING, nullable: true },
        address: { type: Type.STRING, nullable: true }
      }
    },
    invoice_metadata: {
      type: Type.OBJECT,
      properties: {
        invoice_number: { type: Type.STRING },
        invoice_date: { type: Type.STRING },
        due_date: { type: Type.STRING, nullable: true }
      }
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          item_type: { type: Type.STRING },
          hsn_sac: { type: Type.STRING, nullable: true },
          quantity: { type: Type.NUMBER },
          unit_price: { type: Type.NUMBER },
          taxable_value: { type: Type.NUMBER },
          cgst_rate: { type: Type.NUMBER, nullable: true },
          cgst_amount: { type: Type.NUMBER, nullable: true },
          sgst_rate: { type: Type.NUMBER, nullable: true },
          sgst_amount: { type: Type.NUMBER, nullable: true },
          igst_rate: { type: Type.NUMBER, nullable: true },
          igst_amount: { type: Type.NUMBER, nullable: true },
          total_value: { type: Type.NUMBER }
        },
        required: ["description", "quantity", "unit_price", "taxable_value", "total_value"]
      }
    },
    totals: {
      type: Type.OBJECT,
      properties: {
        subtotal_taxable: { type: Type.NUMBER },
        cgst_total: { type: Type.NUMBER },
        sgst_total: { type: Type.NUMBER },
        igst_total: { type: Type.NUMBER },
        grand_total: { type: Type.NUMBER }
      },
      required: ["subtotal_taxable", "grand_total"]
    }
  },
  required: ["document_type", "source_type", "issuer_details", "receiver_details", "invoice_metadata", "items", "totals"]
};

// Send WhatsApp text message
async function sendWhatsAppMessage(recipientPhone: string, text: string, phoneNumberId?: string) {
  const phoneId = phoneNumberId || WHATSAPP_PHONE_NUMBER_ID;
  if (!WHATSAPP_ACCESS_TOKEN || !phoneId) {
    console.warn('[WhatsApp] Skip send: WHATSAPP_ACCESS_TOKEN or PHONE_NUMBER_ID missing');
    return;
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
    const res = await fetch(url, {
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
        text: { preview_url: true, body: text }
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[WhatsApp] Send failed (${res.status}): ${errText}`);
    }
  } catch (err: any) {
    console.error('[WhatsApp] Send error:', err.message);
  }
}

// Download media buffer from Meta Graph API
async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  // Step 1: Get download URL from Meta Graph API
  const metaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: {
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!metaRes.ok) {
    const errText = await metaRes.text().catch(() => '');
    throw new Error(`Media metadata retrieval failed (${metaRes.status}): ${errText}`);
  }

  const metaJson: any = await metaRes.json();
  const downloadUrl = metaJson.url;
  const mimeType = metaJson.mime_type || 'application/pdf';

  if (!downloadUrl) {
    throw new Error(`Meta Graph API returned empty download URL for media ${mediaId}`);
  }

  // Step 2: Download raw binary bytes
  const mediaRes = await fetch(downloadUrl, {
    headers: {
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'User-Agent': 'curl/7.64.1'
    }
  });

  if (!mediaRes.ok) {
    const errText = await mediaRes.text().catch(() => '');
    throw new Error(`Media binary download failed (${mediaRes.status}): ${errText}`);
  }

  const arrayBuffer = await mediaRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType
  };
}

// Extract Invoice using Gemini
async function extractInvoiceWithGemini(fileBuffer: Buffer, mimeType: string) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on server.');
  }

  const base64Data = fileBuffer.toString('base64');
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const prompt = `You are a high-precision AI Invoice and Financial OCR Auditor for Datlion Cnergy (clean energy & battery plant).
Extract all invoice metadata, vendor name, GSTIN, line items, quantities, rates, CGST/SGST/IGST, and grand total.
If Datlion Cnergy is the buyer/receiver, source_type is 'purchase'.
Auto-tag expense_category into: raw_materials, battery_cells_bms, logistics_transport, utilities_electricity, rent_facility, tools_equipment, office_supplies, repairs_maintenance, professional_services, or other.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: invoiceSchema,
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  });

  let raw = response.text || '{}';
  raw = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(raw);
}

// Background Pipeline
async function processInboundInvoice(
  senderPhone: string,
  senderName: string,
  mediaId: string,
  filename: string,
  initialMimeType: string,
  phoneNumberId: string
) {
  let currentStep = 'Downloading attachment from WhatsApp';
  try {
    console.log(`[WhatsApp] Processing invoice from ${senderName} (${senderPhone}) | Media: ${mediaId}`);

    // 1. Download Media
    currentStep = 'Downloading file from Meta Graph API';
    const { buffer: fileBuffer, mimeType } = await downloadWhatsAppMedia(mediaId);

    // 2. Upload to Supabase Storage
    currentStep = 'Saving document to Supabase Storage';
    const fileExt = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : 'jpg';
    const cleanFilename = (filename || `wa_${Date.now()}.${fileExt}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `whatsapp_invoices/${Date.now()}_${cleanFilename}`;

    let publicFileUrl = '';
    const { error: uploadError } = await supabase.storage
      .from('Invoices')
      .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

    if (!uploadError) {
      const { data } = supabase.storage.from('Invoices').getPublicUrl(storagePath);
      publicFileUrl = data?.publicUrl || '';
    } else {
      console.warn('[WhatsApp] Storage upload warning:', uploadError.message);
    }

    // 3. AI Extraction
    currentStep = 'Extracting invoice data with Gemini 2.5 Flash';
    const extracted: any = await extractInvoiceWithGemini(fileBuffer, mimeType);

    const vendorName = extracted.issuer_details?.name || 'Vendor';
    const invNumber = extracted.invoice_metadata?.invoice_number || `WA-${Date.now()}`;
    const grandTotal = Number(extracted.totals?.grand_total) || 0;
    const category = extracted.expense_category || 'other';

    // 4. Insert to Database
    currentStep = 'Inserting invoice record into database';
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
        expense_category: category,
        ingested_via: 'whatsapp_cloud_api',
        sender_phone: senderPhone,
        sender_name: senderName
      },
      items: extracted.items || [],
      totals: extracted.totals || {},
      requires_review: false,
      uploaded_by: `whatsapp:${senderPhone}`
    };

    const { error: dbError } = await supabase.from('invoices').insert([dbPayload]);
    if (dbError) throw dbError;

    // 5. Send Confirmation Message
    currentStep = 'Sending confirmation reply';
    const appUrl = process.env.VITE_APP_URL || 'https://inventory.cnergy.co.in';
    const invoiceLink = `${appUrl}/?view=finance_dashboard`;
    const confirmation = `✅ *Invoice Recorded Successfully!*

📄 *Invoice #:* ${invNumber}
🏢 *Vendor:* ${vendorName}
💰 *Grand Total:* ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
📂 *Category:* ${category.replace(/_/g, ' ').toUpperCase()}
📅 *Date:* ${extracted.invoice_metadata?.invoice_date || new Date().toISOString().split('T')[0]}
📦 *Items:* ${extracted.items?.length || 0} line item(s) extracted

🔗 *View in Finance Dashboard:*
${invoiceLink}`;

    await sendWhatsAppMessage(senderPhone, confirmation, phoneNumberId);
    console.log(`[WhatsApp] Invoice #${invNumber} processed successfully!`);

  } catch (err: any) {
    console.error(`[WhatsApp Error during ${currentStep}]:`, err);
    await sendWhatsAppMessage(
      senderPhone,
      `⚠️ *Invoice Processing Alert*\nFailed during: *${currentStep}*\nDetails: _${err.message || 'Unknown error'}_`,
      phoneNumberId
    );
  }
}

// Main Request Handler
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- GET: Meta Webhook Verification Handshake ---
  if (req.method === 'GET') {
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
      console.log('[WhatsApp Webhook] Verified successfully with challenge:', challenge);
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    } else {
      console.warn('[WhatsApp Webhook] Mismatch token:', { mode, token, expected: WHATSAPP_VERIFY_TOKEN });
      return res.status(403).send('Forbidden');
    }
  }

  // --- POST: Incoming WhatsApp Message Event ---
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

      if (!message) {
        return res.status(200).send('EVENT_RECEIVED');
      }

      const senderPhone = message.from;
      const senderName = contact?.profile?.name || 'User';

      // Whitelist Check
      if (ALLOWED_WHATSAPP_NUMBERS.length > 0) {
        const cleanSender = senderPhone.replace(/\D/g, '');
        const isAllowed = ALLOWED_WHATSAPP_NUMBERS.some(allowed => cleanSender.endsWith(allowed) || allowed.endsWith(cleanSender));
        if (!isAllowed) {
          console.warn('[WhatsApp] Unauthorized sender:', senderPhone);
          return res.status(200).send('SENDER_NOT_AUTHORIZED');
        }
      }

      if (message.type === 'document' || message.type === 'image') {
        const mediaId = message.document?.id || message.image?.id;
        const mimeType = message.document?.mime_type || message.image?.mime_type || 'application/pdf';
        const filename = message.document?.filename || (message.type === 'image' ? 'bill.jpg' : 'invoice.pdf');

        if (mediaId) {
          sendWhatsAppMessage(
            senderPhone,
            `⏳ *Invoice Received!* Analyzing document with Cnergy AI OCR...`,
            phoneNumberId
          ).catch(() => {});

          waitUntil(
            processInboundInvoice(
              senderPhone,
              senderName,
              mediaId,
              filename,
              mimeType,
              phoneNumberId
            )
          );
        }

        return res.status(200).send('EVENT_RECEIVED');
      }

      if (message.type === 'text') {
        const text = (message.text?.body || '').trim().toLowerCase();
        if (text === 'help' || text === 'hi' || text === 'hello') {
          const helpMsg = `👋 *Datlion Cnergy Invoice Bot*\n\nSend or forward any *Invoice PDF* or *Bill photo* to this chat to automatically record it in your plant ledger.`;
          sendWhatsAppMessage(senderPhone, helpMsg, phoneNumberId).catch(() => {});
        }
      }

      return res.status(200).send('EVENT_RECEIVED');
    } catch (err: any) {
      console.error('[WhatsApp Webhook Error]:', err);
      return res.status(200).send('EVENT_RECEIVED');
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
