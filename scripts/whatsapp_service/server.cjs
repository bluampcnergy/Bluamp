/**
 * Standalone WhatsApp Business Invoice Ingestion Daemon for VPS
 * Run with: node server.cjs (or pm2 start server.cjs --name "cnergy-whatsapp")
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI, Type } = require('@google/genai');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Environment Variables
const PORT = process.env.PORT || 3005;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://supabase.cnergy.co.in';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'CNERGY_WA_INVOICE_HOOK_2026';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ALLOWED_WHATSAPP_NUMBERS = (process.env.ALLOWED_WHATSAPP_NUMBERS || '')
  .split(',')
  .map(n => n.trim().replace(/\D/g, ''))
  .filter(Boolean);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper: Send WhatsApp Message
async function sendWhatsAppMessage(recipientPhone, text, phoneNumberId) {
  const phoneId = phoneNumberId || WHATSAPP_PHONE_NUMBER_ID;
  if (!WHATSAPP_ACCESS_TOKEN || !phoneId) return;

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
    console.error('[WhatsApp VPS] Message Send Error:', err.message);
  }
}

// Helper: Download WhatsApp Media
async function downloadWhatsAppMedia(mediaId) {
  const metaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
  });

  if (!metaRes.ok) {
    throw new Error(`Media metadata error (${metaRes.status})`);
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
    throw new Error(`Media download error (${mediaRes.status})`);
  }

  const arrayBuffer = await mediaRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType
  };
}

// Helper: Extract Invoice via Gemini
async function extractInvoiceWithGemini(fileBuffer, mimeType) {
  const base64Data = fileBuffer.toString('base64');
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const prompt = `Extract all details from this invoice into structured JSON.
Company: Datlion Cnergy.
Classify source_type as 'purchase' (expense) if Datlion Cnergy is the buyer.
Classify expense_category into: raw_materials, battery_cells_bms, logistics_transport, utilities_electricity, rent_facility, tools_equipment, office_supplies, repairs_maintenance, professional_services, or other.
Extract all line items, HSN, unit price, quantity, CGST, SGST, IGST, subtotal, and grand total.`;

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
      temperature: 0.1
    }
  });

  let raw = response.text || '{}';
  raw = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(raw);
}

// Background Task Handler
async function processInvoiceTask(senderPhone, senderName, mediaId, filename, initialMimeType, phoneNumberId) {
  try {
    console.log(`[VPS Worker] Processing invoice from ${senderName} (${senderPhone})`);

    const { buffer: fileBuffer, mimeType } = await downloadWhatsAppMedia(mediaId);

    // Upload to Supabase Storage
    const fileExt = mimeType.includes('pdf') ? 'pdf' : 'jpg';
    const storagePath = `whatsapp_invoices/${Date.now()}_${(filename || 'invoice').replace(/[^a-zA-Z0-9._-]/g, '_')}`;

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

    // Insert into DB
    const dbPayload = {
      document_type: extracted.document_type || 'invoice',
      source_type: extracted.source_type || 'purchase',
      filename: publicFileUrl || filename,
      image_link: publicFileUrl || null,
      issuer_details: extracted.issuer_details || {},
      receiver_details: extracted.receiver_details || {},
      invoice_metadata: {
        ...extracted.invoice_metadata,
        invoice_number: invNumber,
        expense_category: category,
        ingested_via: 'whatsapp_vps_service',
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

    const confirmationMsg = `✅ *Invoice Recorded Successfully!*

📄 *Invoice #:* ${invNumber}
🏢 *Vendor:* ${vendorName}
💰 *Grand Total:* ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
📂 *Category:* ${category.replace(/_/g, ' ').toUpperCase()}
📅 *Date:* ${extracted.invoice_metadata?.invoice_date || new Date().toISOString().split('T')[0]}

🔗 *View in Dashboard:*
https://inventory.cnergy.co.in/?view=finance_dashboard`;

    await sendWhatsAppMessage(senderPhone, confirmationMsg, phoneNumberId);
    console.log(`[VPS Worker] Done invoice #${invNumber}`);
  } catch (err) {
    console.error('[VPS Worker] Ingestion Error:', err.message);
    await sendWhatsAppMessage(
      senderPhone,
      `⚠️ *Invoice Processing Alert*\nCould not process invoice: _${err.message}_`,
      phoneNumberId
    );
  }
}

// Routes
app.get('/api/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp VPS] Webhook verified!');
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
});

app.post('/api/webhooks/whatsapp', (req, res) => {
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    const contact = change?.contacts?.[0];
    const phoneNumberId = change?.metadata?.phone_number_id || '';

    if (!message) return;

    const senderPhone = message.from;
    const senderName = contact?.profile?.name || 'User';

    if (ALLOWED_WHATSAPP_NUMBERS.length > 0) {
      const cleanSender = senderPhone.replace(/\D/g, '');
      const isAllowed = ALLOWED_WHATSAPP_NUMBERS.some(allowed => cleanSender.endsWith(allowed) || allowed.endsWith(cleanSender));
      if (!isAllowed) {
        console.warn('[WhatsApp VPS] Unauthorized sender:', senderPhone);
        return;
      }
    }

    if (message.type === 'document' || message.type === 'image') {
      const mediaId = message.document?.id || message.image?.id;
      const mimeType = message.document?.mime_type || message.image?.mime_type || 'application/pdf';
      const filename = message.document?.filename || (message.type === 'image' ? 'bill.jpg' : 'invoice.pdf');

      sendWhatsAppMessage(senderPhone, '⏳ *Invoice Received!* Analyzing with Cnergy AI...', phoneNumberId);
      processInvoiceTask(senderPhone, senderName, mediaId, filename, mimeType, phoneNumberId);
    }
  } catch (err) {
    console.error('[WhatsApp VPS] Webhook error:', err);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`⚡ Datlion Cnergy WhatsApp Invoice Ingestion Service listening on port ${PORT}`);
});
