/**
 * Standalone WhatsApp Business Multi-Automation Daemon for VPS
 * Dual-Mode: Internal DC Operations (Staff) + External Customer Support (Public)
 * Run with: node server.cjs (or pm2 start server.cjs --name "cnergy-whatsapp")
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI, Type } = require('@google/genai');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Environment Variables
const SUPABASE_URL = 'https://supabase.cnergy.co.in';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'CNERGY_WA_INVOICE_HOOK_2026';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const ALLOWED_WHATSAPP_NUMBERS = (process.env.ALLOWED_WHATSAPP_NUMBERS || '')
  .split(',')
  .map(n => n.trim().replace(/\D/g, ''))
  .filter(Boolean);

const APP_URL = process.env.APP_URL || 'https://inventory.cnergy.co.in';
const AUTO_APPROVE_THRESHOLD_INR = 5000;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  }
});

async function getStaffUserByPhone(senderPhone, fallbackName) {
  const cleanSender = (senderPhone || '').replace(/\D/g, '');
  if (!cleanSender) return null;

  try {
    const { data: users, error } = await supabase
      .from('app_users')
      .select('username, name, role, whatsapp_number, is_active');

    if (!error && Array.isArray(users)) {
      const matched = users.find(u => {
        if (!u.whatsapp_number) return false;
        const cleanUserPhone = String(u.whatsapp_number).replace(/\D/g, '');
        if (!cleanUserPhone) return false;
        return (
          cleanSender === cleanUserPhone ||
          cleanSender.endsWith(cleanUserPhone) ||
          cleanUserPhone.endsWith(cleanSender)
        );
      });

      if (matched && matched.is_active !== false) {
        return {
          username: matched.username,
          name: matched.name || fallbackName || matched.username.split('@')[0],
          role: matched.role || 'user',
          whatsapp_number: matched.whatsapp_number,
          isInternal: true
        };
      }
    }
  } catch (err) {
    console.error('[WhatsApp VPS Auth] Error querying app_users:', err.message);
  }

  // Fallback to ALLOWED_WHATSAPP_NUMBERS environment variable
  if (ALLOWED_WHATSAPP_NUMBERS.length > 0) {
    const isAllowed = ALLOWED_WHATSAPP_NUMBERS.some(allowed =>
      cleanSender === allowed ||
      cleanSender.endsWith(allowed) ||
      allowed.endsWith(cleanSender)
    );
    if (isAllowed) {
      return {
        username: 'admin@cnergy.co.in',
        name: fallbackName || 'Plant Admin',
        role: 'admin',
        isInternal: true
      };
    }
  }

  return null;
}

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

// Helper: Extract Invoice via Gemini 2.5 Flash
async function extractInvoiceWithGemini(fileBuffer, mimeType) {
  const base64Data = fileBuffer.toString('base64');
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const prompt = `Extract all details from this invoice into structured JSON.
Company: Datlion Cnergy (lithium battery pack manufacturer).
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
    contents: [
      { inlineData: { mimeType, data: base64Data } },
      { text: prompt }
    ],
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

// Background Invoicing Handler
async function processInvoiceTask(senderPhone, senderName, mediaId, filename, initialMimeType, phoneNumberId) {
  try {
    console.log(`[VPS Worker] Processing invoice from ${senderName} (${senderPhone})`);

    const { buffer: fileBuffer, mimeType } = await downloadWhatsAppMedia(mediaId);

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

    const extracted = await extractInvoiceWithGemini(fileBuffer, mimeType);

    const vendorName = extracted.issuer_details?.name || 'Vendor';
    const invNumber = extracted.invoice_metadata?.invoice_number || `WA-${Date.now()}`;
    const grandTotal = Number(extracted.totals?.grand_total) || 0;
    const category = extracted.expense_category || 'other';

    const hasLineItems = Array.isArray(extracted.items) && extracted.items.length > 0;
    const isAboveThreshold = grandTotal > AUTO_APPROVE_THRESHOLD_INR;
    const requiresReview = isAboveThreshold || !hasLineItems || grandTotal <= 0;

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
        sender_name: senderName,
        auto_approved: !requiresReview
      },
      items: extracted.items || [],
      totals: extracted.totals || {},
      requires_review: requiresReview,
      uploaded_by: `whatsapp:${senderPhone}`
    };

    const { error: dbError } = await supabase.from('invoices').insert([dbPayload]);
    if (dbError) throw dbError;

    let confirmationMsg = '';
    if (requiresReview) {
      const reviewLink = `${APP_URL}/?view=finance_upload`;
      const reason = isAboveThreshold 
        ? `Amount (₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) > ₹${AUTO_APPROVE_THRESHOLD_INR.toLocaleString('en-IN')} Threshold` 
        : 'Line items verification needed';

      confirmationMsg = `⏳ *Invoice Queued for Verification*

📄 *Invoice #:* ${invNumber}
🏢 *Vendor:* ${vendorName}
💰 *Grand Total:* ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
📂 *Category:* ${category.replace(/_/g, ' ').toUpperCase()}
📅 *Date:* ${extracted.invoice_metadata?.invoice_date || new Date().toISOString().split('T')[0]}
📦 *Items:* ${extracted.items?.length || 0} line item(s) extracted
⚠️ *Status:* Pending Approval (${reason})

🔗 *Review & Approve in Scan Invoice:*
${reviewLink}`;
    } else {
      const invoiceLink = `${APP_URL}/?view=finance_dashboard`;
      confirmationMsg = `✅ *Invoice Auto-Approved & Recorded!*

📄 *Invoice #:* ${invNumber}
🏢 *Vendor:* ${vendorName}
💰 *Grand Total:* ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
📂 *Category:* ${category.replace(/_/g, ' ').toUpperCase()}
📅 *Date:* ${extracted.invoice_metadata?.invoice_date || new Date().toISOString().split('T')[0]}
📦 *Items:* ${extracted.items?.length || 0} line item(s) extracted
⚡ *Status:* Auto-Approved (Amount ≤ ₹${AUTO_APPROVE_THRESHOLD_INR.toLocaleString('en-IN')})

🔗 *View in Dashboard:*
${invoiceLink}`;
    }

    await sendWhatsAppMessage(senderPhone, confirmationMsg, phoneNumberId);
    console.log(`[VPS Worker] Done invoice #${invNumber} (requires_review: ${requiresReview})`);
  } catch (err) {
    console.error('[VPS Worker] Ingestion Error:', err.message);
    await sendWhatsAppMessage(
      senderPhone,
      `⚠️ *Invoice Processing Alert*\nCould not process invoice: _${err.message}_`,
      phoneNumberId
    );
  }
}

// Background Task Management
async function handleListTasks(senderPhone, staffUser, phoneNumberId, filterUser) {
  try {
    const { data: tasks, error } = await supabase
      .from('employee_tasks')
      .select('*')
      .or('completed.is.null,completed.eq.false')
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) throw error;

    const validTasks = (tasks || []).filter(t => t.assigned_to !== 'general' && t.assigned_to !== 'chitale');
    
    let targetFilter = filterUser?.trim();

    if (!targetFilter && staffUser.role === 'user') {
      targetFilter = staffUser.name || staffUser.username;
    }

    let filtered = validTasks;
    if (targetFilter && targetFilter.toLowerCase() !== 'all') {
      const cleanTarget = targetFilter.toLowerCase().replace('@cnergy.co.in', '').trim();
      filtered = validTasks.filter(t => {
        const assigned = (t.assigned_to || '').toLowerCase();
        const assignedClean = assigned.replace('@cnergy.co.in', '').trim();
        return (
          assigned.includes(cleanTarget) ||
          assignedClean.includes(cleanTarget) ||
          cleanTarget.includes(assignedClean) ||
          assigned === 'team' ||
          assigned === 'all'
        );
      });
    }

    if (filtered.length === 0) {
      const targetLabel = targetFilter && targetFilter.toLowerCase() !== 'all' ? ` assigned to *${targetFilter}*` : '';
      return await sendWhatsAppMessage(senderPhone, `🎉 *No Pending Tasks!*${targetLabel}\nAll tasks are currently completed. Have a productive shift! 🔋`, phoneNumberId);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const taskLines = filtered.slice(0, 20).map((t, idx) => {
      let badge = '⚪';
      if (t.due_date) {
        if (t.due_date < todayStr) badge = '🚨 [OVERDUE]';
        else if (t.due_date === todayStr) badge = '🔴 [TODAY]';
        else badge = '🟡';
      }
      return `${idx + 1}. ${badge} *${t.title}*\n   👤 Assigned: *${t.assigned_to}* | Due: _${t.due_date || 'No Due Date'}_ | ID: \`${t.id}\``;
    });

    const header = targetFilter && targetFilter.toLowerCase() !== 'all'
      ? `📋 *Tasks for ${targetFilter} (${filtered.length})*`
      : `📋 *Datlion Cnergy Pending Tasks (${filtered.length})*`;

    const msg = `${header}\n\n${taskLines.join('\n\n')}\n\n💡 _To complete a task, reply: "Done <task ID or task name>"_`;
    await sendWhatsAppMessage(senderPhone, msg, phoneNumberId);
  } catch (err) {
    await sendWhatsAppMessage(senderPhone, `⚠️ Could not fetch tasks: ${err.message}`, phoneNumberId);
  }
}

async function handleCompleteTask(senderPhone, text, phoneNumberId) {
  try {
    const cleanText = text.replace(/^(complete|done|finish|mark done|mark completed|closed)\s*(task)?/i, '').trim();
    if (!cleanText) return await sendWhatsAppMessage(senderPhone, `❓ Specify task ID or title: *"Done task-1787768203255"*`, phoneNumberId);

    const { data: pendingTasks } = await supabase
      .from('employee_tasks')
      .select('id, title, assigned_to')
      .or('completed.is.null,completed.eq.false');

    const match = (pendingTasks || []).find(t => 
      t.id.toLowerCase() === cleanText.toLowerCase() || 
      t.title.toLowerCase().includes(cleanText.toLowerCase()) ||
      cleanText.toLowerCase().includes(t.title.toLowerCase())
    );

    if (!match) return await sendWhatsAppMessage(senderPhone, `⚠️ Task not found matching: "${cleanText}"`, phoneNumberId);

    await supabase.from('employee_tasks').update({ completed: true }).eq('id', match.id);
    await sendWhatsAppMessage(senderPhone, `✅ *Task Completed!*\n📌 *${match.title}*\n👤 Assigned: ${match.assigned_to}`, phoneNumberId);
  } catch (err) {
    await sendWhatsAppMessage(senderPhone, `⚠️ Error: ${err.message}`, phoneNumberId);
  }
}

// Background Plant AI Intelligence
async function handlePlantAiQuery(senderPhone, staffUser, text, phoneNumberId) {
  try {
    const isRestrictedRole = staffUser.role === 'user';

    const [rgRes, wipRes, fgRes, tasksRes, pricesRes] = await Promise.all([
      supabase.from('received_goods').select('name, category, makeModel, supplier, quantity, status').limit(50),
      supabase.from('wip_items').select('batch_number, model, quantity, current_stage').limit(30),
      supabase.from('finished_goods').select('recipeId, quantity, deliveredTo').limit(30),
      supabase.from('employee_tasks').select('title, assigned_to, due_date').or('completed.is.null,completed.eq.false').limit(30),
      isRestrictedRole ? Promise.resolve({ data: [] }) : supabase.from('price_list').select('model_name, price_without_gst').limit(30)
    ]);

    const context = {
      raw_materials: rgRes.data || [],
      wip_production: wipRes.data || [],
      finished_batteries: fgRes.data || [],
      pending_tasks: tasksRes.data || [],
      battery_models: pricesRes.data || []
    };

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = `You are the AI Assistant for Datlion Cnergy Plant OS.
Staff Member: ${staffUser.name} (${staffUser.username}) [Role: ${staffUser.role}]
Answer the user's WhatsApp question concisely and accurately using this plant data:
${JSON.stringify(context, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { text: prompt },
        { text: `Staff User (${staffUser.name}): "${text}"` }
      ],
      config: { temperature: 0.2, maxOutputTokens: 2048 }
    });

    await sendWhatsAppMessage(senderPhone, response.text || 'No data found.', phoneNumberId);
  } catch (err) {
    await sendWhatsAppMessage(senderPhone, `⚠️ Plant AI query failed: ${err.message}`, phoneNumberId);
  }
}

// Help Menu
async function sendHelpMenu(senderPhone, staffUser, phoneNumberId) {
  const roleLabel =
    staffUser.role === 'admin'
      ? '👑 Director Admin'
      : staffUser.role === 'billing'
      ? '💼 Billing & Operations'
      : staffUser.role === 'dashboard_user'
      ? '📊 Dashboard Data Employee'
      : '🔧 General Production Staff';

  const menu = `⚡ *Datlion Cnergy Plant OS*
👋 Hello *${staffUser.name}*! (${roleLabel})

Here is what you can do directly from this WhatsApp chat:

📋 *1. Tasks*
• View tasks: _"My tasks"_ or _"Show pending tasks"_
• Complete: _"Done <task ID or title>"_

📦 *2. Plant Floor Check*
• _"How many 3.2V 100Ah cells in stock?"_
• _"Show WIP batches in production"_

📄 *3. Invoicing & Bill OCR*
• Forward any invoice PDF, supplier bill, or receipt photo.

💬 Simply type your query or send a document to begin!`;

  await sendWhatsAppMessage(senderPhone, menu, phoneNumberId);
}

// External Customer Assistant
async function handleExternalCustomerMessage(senderPhone, senderName, text, phoneNumberId) {
  const customerMenu = `⚡ *Welcome to Datlion Cnergy!*
_Powering India's Clean Energy & Battery Future_ 🔋

Hello *${senderName}*! How can we assist you today?

🛡️ *1. Warranty & Support Portal*
For warranty claims, product service, RMA, or ticket tracking:
👉 https://support.cnergy.co.in

⚡ *2. Lithium Batteries & Solar Solutions*
Explore our lithium battery packs, solar inverters, and specs:
👉 https://cnergy.co.in

☀️ *3. Solar Installation & Payback Calculator*
Calculate your solar power requirements and cost savings:
👉 https://solarcalculator.cnergy.co.in

📧 *Direct Assistance:*
• Sales: sales@cnergy.co.in
• Service: support@cnergy.co.in

_Feel free to ask any question about our clean energy products!_`;

  await sendWhatsAppMessage(senderPhone, customerMenu, phoneNumberId);
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

app.post('/api/webhooks/whatsapp', async (req, res) => {
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

    if (!message) return res.status(200).send('EVENT_RECEIVED');

    const senderPhone = message.from;
    const senderName = contact?.profile?.name || 'User';
    
    // Dynamic user lookup
    const staffUser = await getStaffUserByPhone(senderPhone, senderName);

    if (message.type === 'document' || message.type === 'image') {
      if (!staffUser) {
        const externalMsg = `📄 *Document Received!*

Thank you *${senderName}* for contacting Datlion Cnergy.
For Warranty, RMA, or Service Support, please submit your request at:
👉 https://support.cnergy.co.in`;
        sendWhatsAppMessage(senderPhone, externalMsg, phoneNumberId).catch(console.error);
        return res.status(200).send('EVENT_RECEIVED');
      }

      const mediaId = message.document?.id || message.image?.id;
      const mimeType = message.document?.mime_type || message.image?.mime_type || 'application/pdf';
      const filename = message.document?.filename || (message.type === 'image' ? 'bill.jpg' : 'invoice.pdf');

      if (mediaId) {
        sendWhatsAppMessage(senderPhone, `⏳ *Document Received from ${staffUser.name}!* Analyzing with Cnergy AI OCR...`, phoneNumberId).catch(() => {});
        processInvoiceTask(senderPhone, staffUser.name, mediaId, filename, mimeType, phoneNumberId).catch(console.error);
      }
      return res.status(200).send('EVENT_RECEIVED');
    }

    if (message.type === 'text') {
      const clean = (message.text?.body || '').trim();
      const lower = clean.toLowerCase();

      if (!staffUser) {
        handleExternalCustomerMessage(senderPhone, senderName, clean, phoneNumberId).catch(console.error);
        return res.status(200).send('EVENT_RECEIVED');
      }

      if (['hi', 'hello', 'hey', 'help', 'menu', 'options', 'start'].includes(lower)) {
        sendHelpMenu(senderPhone, staffUser, phoneNumberId).catch(console.error);
      } else if (lower.startsWith('task') || lower.startsWith('show task') || lower.startsWith('list task') || lower.includes('tasks for') || lower.includes('my tasks')) {
        let filterUser;
        if (lower.includes('my tasks') || lower === 'tasks') {
          filterUser = staffUser.role === 'user' ? staffUser.name : undefined;
        } else if (lower.includes('for ')) {
          filterUser = lower.split('for ')[1].trim();
        }
        handleListTasks(senderPhone, staffUser, phoneNumberId, filterUser).catch(console.error);
      } else if (lower.startsWith('done ') || lower.startsWith('complete ')) {
        handleCompleteTask(senderPhone, clean, phoneNumberId).catch(console.error);
      } else {
        handlePlantAiQuery(senderPhone, staffUser, clean, phoneNumberId).catch(console.error);
      }

      return res.status(200).send('EVENT_RECEIVED');
    }

    return res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    console.error('[WhatsApp VPS Error]:', err);
    return res.status(200).send('EVENT_RECEIVED');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Multi-Automation Daemon running on port ${PORT}`);
});
