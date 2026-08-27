import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://supabase.cnergy.co.in';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
const supabase = createClient(supabaseUrl, supabaseKey);

// WhatsApp & Gemini Configuration
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'CNERGY_WA_INVOICE_HOOK_2026';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const ALLOWED_WHATSAPP_NUMBERS = (process.env.ALLOWED_WHATSAPP_NUMBERS || '')
  .split(',')
  .map(n => n.trim().replace(/\D/g, ''))
  .filter(Boolean);

// Send WhatsApp text message
async function sendWhatsAppMessage(recipientPhone, text, phoneNumberId) {
  const phoneId = phoneNumberId || WHATSAPP_PHONE_NUMBER_ID;
  if (!WHATSAPP_ACCESS_TOKEN || !phoneId) {
    console.warn('[WhatsApp] Skip send: WHATSAPP_ACCESS_TOKEN or PHONE_NUMBER_ID missing');
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
        text: { preview_url: true, body: text }
      })
    });
  } catch (err) {
    console.error('[WhatsApp] Send error:', err.message);
  }
}

// Download media buffer from Meta Graph API
async function downloadWhatsAppMedia(mediaId) {
  const metaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to retrieve media URL (${metaRes.status})`);
  }

  const metaJson = await metaRes.json();
  const downloadUrl = metaJson.url;
  const mimeType = metaJson.mime_type || 'application/pdf';

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

// Extract Invoice using Gemini
async function extractInvoiceWithGemini(fileBuffer, mimeType) {
  const base64Data = fileBuffer.toString('base64');
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const prompt = `You are a high-precision AI Invoice and Financial OCR Auditor for Datlion Cnergy (clean energy & battery plant).
Extract all invoice metadata, vendor name, GSTIN, line items, quantities, rates, CGST/SGST/IGST, and grand total.
If Datlion Cnergy is the buyer/receiver, source_type is 'purchase'.
Auto-tag expense_category into: raw_materials, battery_cells_bms, logistics_transport, utilities_electricity, rent_facility, tools_equipment, office_supplies, repairs_maintenance, professional_services, or other.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      document_type: { type: Type.STRING },
      source_type: { type: Type.STRING },
      expense_category: { type: Type.STRING },
      issuer_details: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING }, gstin: { type: Type.STRING } }
      },
      receiver_details: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING }, gstin: { type: Type.STRING } }
      },
      invoice_metadata: {
        type: Type.OBJECT,
        properties: { invoice_number: { type: Type.STRING }, invoice_date: { type: Type.STRING } }
      },
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            unit_price: { type: Type.NUMBER },
            taxable_value: { type: Type.NUMBER },
            total_value: { type: Type.NUMBER }
          }
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
        }
      }
    }
  };

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
      responseSchema: schema,
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  });

  let raw = response.text || '{}';
  raw = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(raw);
}

// Background Pipeline
async function processInboundInvoice(senderPhone, senderName, mediaId, filename, initialMimeType, phoneNumberId) {
  try {
    console.log(`[WhatsApp] Processing invoice from ${senderName} (${senderPhone})`);

    const { buffer: fileBuffer, mimeType } = await downloadWhatsAppMedia(mediaId);

    // Upload to Supabase Storage
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
    }

    // AI Extraction
    const extracted = await extractInvoiceWithGemini(fileBuffer, mimeType);

    const vendorName = extracted.issuer_details?.name || 'Vendor';
    const invNumber = extracted.invoice_metadata?.invoice_number || `WA-${Date.now()}`;
    const grandTotal = Number(extracted.totals?.grand_total) || 0;
    const category = extracted.expense_category || 'other';

    // Insert to database
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

    // Send confirmation message
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
    console.log(`[WhatsApp] Invoice #${invNumber} completed successfully!`);

  } catch (err) {
    console.error('[WhatsApp] Processing error:', err);
    await sendWhatsAppMessage(
      senderPhone,
      `⚠️ *Invoice Processing Alert*\nCould not process invoice: _${err.message}_`,
      phoneNumberId
    );
  }
}

// Universal Request Handler for Vercel Serverless
export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      return res.end();
    }

    // --- GET: Meta Webhook Verification Handshake ---
    if (req.method === 'GET') {
      let mode = '';
      let token = '';
      let challenge = '';

      if (req.query) {
        mode = req.query['hub.mode'] || '';
        token = req.query['hub.verify_token'] || '';
        challenge = req.query['hub.challenge'] || '';
      }

      if (!mode && req.url) {
        try {
          const u = new URL(req.url, 'http://localhost');
          mode = u.searchParams.get('hub.mode') || '';
          token = u.searchParams.get('hub.verify_token') || '';
          challenge = u.searchParams.get('hub.challenge') || '';
        } catch (e) {}
      }

      if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
        console.log('[WhatsApp Webhook] Handshake verified with challenge:', challenge);
        res.setHeader('Content-Type', 'text/plain');
        res.statusCode = 200;
        return res.end(String(challenge));
      } else {
        console.warn('[WhatsApp Webhook] Handshake mismatch:', { mode, token, expected: WHATSAPP_VERIFY_TOKEN });
        res.setHeader('Content-Type', 'text/plain');
        res.statusCode = 403;
        return res.end('Forbidden');
      }
    }

    // --- POST: Incoming WhatsApp Message Event ---
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }

      if (!body || body.object !== 'whatsapp_business_account') {
        res.setHeader('Content-Type', 'text/plain');
        res.statusCode = 200;
        return res.end('EVENT_RECEIVED');
      }

      const entry = body.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const message = change?.messages?.[0];
      const contact = change?.contacts?.[0];
      const phoneNumberId = change?.metadata?.phone_number_id || '';

      if (!message) {
        res.setHeader('Content-Type', 'text/plain');
        res.statusCode = 200;
        return res.end('EVENT_RECEIVED');
      }

      const senderPhone = message.from;
      const senderName = contact?.profile?.name || 'User';

      // Whitelist Security Check
      if (ALLOWED_WHATSAPP_NUMBERS.length > 0) {
        const cleanSender = senderPhone.replace(/\D/g, '');
        const isAllowed = ALLOWED_WHATSAPP_NUMBERS.some(allowed => cleanSender.endsWith(allowed) || allowed.endsWith(cleanSender));
        if (!isAllowed) {
          console.warn('[WhatsApp] Rejected unauthorized sender:', senderPhone);
          res.setHeader('Content-Type', 'text/plain');
          res.statusCode = 200;
          return res.end('SENDER_NOT_AUTHORIZED');
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

          // Execute asynchronously in background
          processInboundInvoice(
            senderPhone,
            senderName,
            mediaId,
            filename,
            mimeType,
            phoneNumberId
          ).catch(err => console.error('[WhatsApp Background Error]:', err));
        }

        res.setHeader('Content-Type', 'text/plain');
        res.statusCode = 200;
        return res.end('EVENT_RECEIVED');
      }

      if (message.type === 'text') {
        const text = (message.text?.body || '').trim().toLowerCase();
        if (text === 'help' || text === 'hi' || text === 'hello') {
          const helpMsg = `👋 *Datlion Cnergy Invoice Bot*\n\nSend or forward any *Invoice PDF* or *Bill photo* to this chat to automatically record it in your plant ledger.`;
          sendWhatsAppMessage(senderPhone, helpMsg, phoneNumberId).catch(() => {});
        }
      }

      res.setHeader('Content-Type', 'text/plain');
      res.statusCode = 200;
      return res.end('EVENT_RECEIVED');
    }

    res.statusCode = 405;
    return res.json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('[WhatsApp Webhook Fatal Error]:', error);
    res.setHeader('Content-Type', 'text/plain');
    res.statusCode = 200;
    return res.end('EVENT_RECEIVED');
  }
}
