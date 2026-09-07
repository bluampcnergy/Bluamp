import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { waitUntil } from '@vercel/functions';

// --- Supabase Configuration ---
// Bound directly to the production self-hosted VPS Supabase instance with verified service role key
const SUPABASE_URL = 'https://supabase.cnergy.co.in';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  global: {
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  }
});

// --- WhatsApp & Gemini Configuration ---
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'CNERGY_WA_INVOICE_HOOK_2026';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.VITE_API_KEY || '';

// Internal Authorized Numbers (Format: digits only, e.g. 919876543210 or 9876543210)
const ALLOWED_WHATSAPP_NUMBERS = (process.env.ALLOWED_WHATSAPP_NUMBERS || '')
  .split(',')
  .map(n => n.trim().replace(/\D/g, ''))
  .filter(Boolean);

const APP_URL = process.env.VITE_APP_URL || 'https://inventory.cnergy.co.in';
const AUTO_APPROVE_THRESHOLD_INR = 5000;

export interface StaffIdentity {
  username: string;
  name: string;
  role: 'admin' | 'billing' | 'user' | 'dashboard_user';
  whatsapp_number?: string;
  isInternal: boolean;
}

// --- Dynamic Staff Recognition via Supabase app_users ---
async function getStaffUserByPhone(senderPhone: string, fallbackName?: string): Promise<StaffIdentity | null> {
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
          role: (matched.role as StaffIdentity['role']) || 'user',
          whatsapp_number: matched.whatsapp_number,
          isInternal: true
        };
      }
    }
  } catch (err: any) {
    console.error('[WhatsApp Auth] Error querying app_users:', err);
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

// --- Schemas for Structured Gemini Calls ---

const invoiceSchema = {
  type: Type.OBJECT,
  properties: {
    document_type: { type: Type.STRING, enum: ["invoice", "delivery_challan", "receipt", "credit_note", "debit_note", "purchase_order", "bill", "other"] },
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

const taskExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    assigned_to: { type: Type.STRING },
    description: { type: Type.STRING, nullable: true },
    due_date: { type: Type.STRING, nullable: true }
  },
  required: ["title", "assigned_to"]
};

const quotationDraftSchema = {
  type: Type.OBJECT,
  properties: {
    document_type: { type: Type.STRING, enum: ["quotation", "po", "proforma", "invoice"] },
    company_name: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit_price: { type: Type.NUMBER }
        },
        required: ["description", "quantity", "unit_price"]
      }
    },
    custom_title: { type: Type.STRING, nullable: true },
    notes: { type: Type.STRING, nullable: true }
  },
  required: ["document_type", "company_name", "items"]
};

// --- Helper Functions ---

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

// Extract Invoice using Gemini 2.5 Flash
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

// --- WORKFLOW 1: Internal Inbound Invoice / Bill Processing ---
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

    // 4. Threshold & Verification Check (Threshold = ₹5,000)
    const hasLineItems = Array.isArray(extracted.items) && extracted.items.length > 0;
    const isAboveThreshold = grandTotal > AUTO_APPROVE_THRESHOLD_INR;
    const requiresReview = isAboveThreshold || !hasLineItems || grandTotal <= 0;

    // 5. Insert into Database
    currentStep = 'Inserting invoice record into database';
    const isChallan = extracted.document_type === 'delivery_challan' ||
      invNumber.toUpperCase().startsWith('DCH') ||
      cleanFilename.toLowerCase().includes('challan') ||
      cleanFilename.toLowerCase().includes('dch');

    const dbPayload = {
      document_type: isChallan ? 'delivery_challan' : (extracted.document_type || 'invoice'),
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

    // 6. Send Confirmation Message
    currentStep = 'Sending confirmation reply';
    let confirmation = '';
    if (requiresReview) {
      const reviewLink = `${APP_URL}/?view=finance_upload`;
      const reason = isAboveThreshold 
        ? `Amount (₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) > ₹${AUTO_APPROVE_THRESHOLD_INR.toLocaleString('en-IN')} Threshold` 
        : 'Line items verification needed';

      confirmation = `⏳ *Invoice Queued for Verification*

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
      confirmation = `✅ *Invoice Auto-Approved & Recorded!*

📄 *Invoice #:* ${invNumber}
🏢 *Vendor:* ${vendorName}
💰 *Grand Total:* ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
📂 *Category:* ${category.replace(/_/g, ' ').toUpperCase()}
📅 *Date:* ${extracted.invoice_metadata?.invoice_date || new Date().toISOString().split('T')[0]}
📦 *Items:* ${extracted.items?.length || 0} line item(s) extracted
⚡ *Status:* Auto-Approved (Amount ≤ ₹${AUTO_APPROVE_THRESHOLD_INR.toLocaleString('en-IN')})

🔗 *View in Finance Dashboard:*
${invoiceLink}`;
    }

    await sendWhatsAppMessage(senderPhone, confirmation, phoneNumberId);
    console.log(`[WhatsApp] Invoice #${invNumber} processed (requires_review: ${requiresReview})`);

  } catch (err: any) {
    console.error(`[WhatsApp Error during ${currentStep}]:`, err);
    await sendWhatsAppMessage(
      senderPhone,
      `⚠️ *Invoice Processing Alert*\nFailed during: *${currentStep}*\nDetails: _${err.message || 'Unknown error'}_`,
      phoneNumberId
    );
  }
}

// --- WORKFLOW 2: Internal Task Management ---
async function handleListTasks(senderPhone: string, staffUser: StaffIdentity, phoneNumberId: string, filterUser?: string) {
  try {
    const { data: tasks, error } = await supabase
      .from('employee_tasks')
      .select('*')
      .or('completed.is.null,completed.eq.false')
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) throw error;

    const validTasks = (tasks || []).filter(t => t.assigned_to !== 'general' && t.assigned_to !== 'chitale');
    
    let targetFilter = filterUser?.trim();

    // If general employee without a filter, or asking "my tasks", target their name/username
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
      return await sendWhatsAppMessage(
        senderPhone,
        `🎉 *No Pending Tasks!*${targetLabel}\nAll tasks are currently completed. Have a productive shift! 🔋`,
        phoneNumberId
      );
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
  } catch (err: any) {
    await sendWhatsAppMessage(senderPhone, `⚠️ Could not fetch tasks: ${err.message}`, phoneNumberId);
  }
}

async function handleCompleteTask(senderPhone: string, text: string, phoneNumberId: string) {
  try {
    const cleanText = text.replace(/^(complete|done|finish|mark done|mark completed|closed)\s*(task)?/i, '').trim();
    if (!cleanText) {
      return await sendWhatsAppMessage(senderPhone, `❓ Please specify the task ID or name to complete. E.g., *"Done task-1787768203255"* or *"Done Discuss with Neeraj"*.`, phoneNumberId);
    }

    const { data: pendingTasks } = await supabase
      .from('employee_tasks')
      .select('id, title, assigned_to')
      .or('completed.is.null,completed.eq.false');

    const match = (pendingTasks || []).find(t => 
      t.id.toLowerCase() === cleanText.toLowerCase() || 
      t.title.toLowerCase().includes(cleanText.toLowerCase()) ||
      cleanText.toLowerCase().includes(t.title.toLowerCase())
    );

    if (!match) {
      return await sendWhatsAppMessage(senderPhone, `⚠️ Could not find an active task matching: "${cleanText}". Check task list with *"tasks"*.`, phoneNumberId);
    }

    const { error: updateError } = await supabase
      .from('employee_tasks')
      .update({ completed: true })
      .eq('id', match.id);

    if (updateError) throw updateError;

    await sendWhatsAppMessage(
      senderPhone,
      `✅ *Task Completed!*\n\n📌 *${match.title}*\n👤 Assigned: ${match.assigned_to}\n🆔 ID: \`${match.id}\``,
      phoneNumberId
    );
  } catch (err: any) {
    await sendWhatsAppMessage(senderPhone, `⚠️ Error completing task: ${err.message}`, phoneNumberId);
  }
}

async function handleCreateTask(senderPhone: string, senderName: string, text: string, phoneNumberId: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const todayStr = new Date().toISOString().split('T')[0];

    const prompt = `Extract task details from this instruction into JSON:
Instruction: "${text}"
Current Date: ${todayStr}

Assign to the person mentioned, or 'Team' if unspecified. Extract a clear title, description, and YYYY-MM-DD due date if mentioned (e.g. tomorrow, next monday).`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: taskExtractionSchema,
        temperature: 0.1
      }
    });

    let raw = response.text || '{}';
    raw = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const taskData = JSON.parse(raw);

    const taskId = 'task-' + Date.now();
    const newTask = {
      id: taskId,
      title: taskData.title || 'New Task',
      description: taskData.description || text,
      assigned_to: taskData.assigned_to || 'Team',
      due_date: taskData.due_date || todayStr,
      completed: false,
      created_at: Date.now(),
      created_by: `whatsapp:${senderName}`
    };

    const { error } = await supabase.from('employee_tasks').insert([newTask]);
    if (error) throw error;

    const msg = `✅ *Task Created Successfully!*\n\n📌 *Title:* ${newTask.title}\n👤 *Assigned To:* ${newTask.assigned_to}\n📅 *Due Date:* ${newTask.due_date}\n🆔 *Task ID:* \`${taskId}\``;
    await sendWhatsAppMessage(senderPhone, msg, phoneNumberId);
  } catch (err: any) {
    await sendWhatsAppMessage(senderPhone, `⚠️ Could not create task: ${err.message}`, phoneNumberId);
  }
}

// --- WORKFLOW 3: Fast Quotations & PO Generator ---
async function handleCreateQuotationDraft(senderPhone: string, staffUser: StaffIdentity, text: string, phoneNumberId: string) {
  try {
    if (staffUser.role !== 'admin' && staffUser.role !== 'billing') {
      return await sendWhatsAppMessage(
        senderPhone,
        `🔒 *Permission Restricted*\nQuotation & PO generation is available to *Billing & Operations* and *Admin* accounts.\nFor general inquiries, type *"help"* or *"my tasks"*.`,
        phoneNumberId
      );
    }

    const [companiesRes, pricesRes] = await Promise.all([
      supabase.from('company_profiles').select('name, shippingAddress, gstNumber'),
      supabase.from('price_list').select('model_name, price_without_gst, hsn_code')
    ]);

    const companies = companiesRes.data || [];
    const priceList = pricesRes.data || [];

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = `You are an AI Billing & Quotation specialist for Datlion Cnergy (battery pack manufacturing plant).
Translate the user's request into a structured Quotation or PO draft JSON.

Known Companies: ${JSON.stringify(companies.map(c => c.name))}
Price List Models: ${JSON.stringify(priceList.map(p => ({ model: p.model_name, price: p.price_without_gst })))}

User Request: "${text}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: quotationDraftSchema,
        temperature: 0.1
      }
    });

    let raw = response.text || '{}';
    raw = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const draftData = JSON.parse(raw);

    const isPO = draftData.document_type === 'po';
    const targetCompany = companies.find(c => c.name.toLowerCase().includes((draftData.company_name || '').toLowerCase())) || {
      name: draftData.company_name || 'Client Name',
      shippingAddress: '',
      gstNumber: ''
    };

    const docItems = (draftData.items || []).map((it: any) => {
      const matchedPrice = priceList.find(p => p.model_name.toLowerCase().includes(it.description.toLowerCase()));
      const unitPrice = Number(it.unit_price) || matchedPrice?.price_without_gst || 1000;
      const qty = Number(it.quantity) || 1;
      const taxable = qty * unitPrice;
      const taxRate = 18;
      const taxAmt = taxable * (taxRate / 100);
      return {
        description: it.description,
        hsn_sac: matchedPrice?.hsn_code || '85076000',
        quantity: qty,
        unit_price: unitPrice,
        taxable_value: taxable,
        cgst_rate: 9,
        cgst_amount: taxAmt / 2,
        sgst_rate: 9,
        sgst_amount: taxAmt / 2,
        igst_rate: 0,
        igst_amount: 0,
        total_value: taxable + taxAmt
      };
    });

    const subtotal = docItems.reduce((sum: number, it: any) => sum + (it.taxable_value || 0), 0);
    const taxTotal = docItems.reduce((sum: number, it: any) => sum + (it.cgst_amount || 0) + (it.sgst_amount || 0), 0);
    const grandTotal = subtotal + taxTotal;
    const invNumber = `DRAFT-${Date.now().toString().slice(-6)}`;

    const draftRecord = {
      document_type: isPO ? 'generated_po' : 'generated_quotation',
      source_type: isPO ? 'purchase' : 'sales',
      filename: invNumber,
      receiver_details: isPO ? { name: 'Datlion Cnergy Private Limited' } : { name: targetCompany.name, address: targetCompany.shippingAddress, gstin: targetCompany.gstNumber },
      issuer_details: isPO ? { name: targetCompany.name, address: targetCompany.shippingAddress, gstin: targetCompany.gstNumber } : { name: 'DATLION CNERGY PRIVATE LIMITED', gstin: '27AAECD4823M1ZU' },
      invoice_metadata: {
        invoice_number: invNumber,
        invoice_date: new Date().toISOString().split('T')[0],
        custom_title: draftData.custom_title || (isPO ? 'PURCHASE ORDER' : 'QUOTATION'),
        notes: draftData.notes || `Created via WhatsApp by ${staffUser.name}`,
        ui_config: {
          showTaxTable: false,
          showTotalsTable: true,
          terms: '1. Payment terms: 50% advance, balance before dispatch.\n2. Delivery within 14 business days.'
        }
      },
      items: docItems,
      totals: {
        subtotal_taxable: subtotal,
        cgst_total: taxTotal / 2,
        sgst_total: taxTotal / 2,
        igst_total: 0,
        grand_total: grandTotal,
        currency: 'INR'
      },
      requires_review: false,
      uploaded_by: `whatsapp:${staffUser.name} (${staffUser.username})`
    };

    const { data: inserted, error: insertError } = await supabase.from('invoices').insert([draftRecord]).select('id').single();
    if (insertError) throw insertError;

    const editorLink = `${APP_URL}/?view=finance_maker&id=${inserted.id}`;
    const reply = `📄 *${isPO ? 'Purchase Order' : 'Quotation'} Draft Created!*

🏢 *Party:* ${targetCompany.name}
💰 *Estimated Total:* ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
📦 *Line Items:* ${docItems.length} item(s)

🔗 *Open & Edit in Invoice Maker:*
${editorLink}`;

    await sendWhatsAppMessage(senderPhone, reply, phoneNumberId);
  } catch (err: any) {
    await sendWhatsAppMessage(senderPhone, `⚠️ Could not create draft: ${err.message}`, phoneNumberId);
  }
}

// --- WORKFLOW 4: Real-time Plant & Stock Intelligence ---
async function handlePlantAiQuery(senderPhone: string, staffUser: StaffIdentity, text: string, phoneNumberId: string) {
  try {
    const isRestrictedRole = staffUser.role === 'user';

    const [rgRes, wipRes, fgRes, tasksRes, pricesRes] = await Promise.all([
      supabase.from('received_goods').select('name, category, makeModel, supplier, quantity, status').limit(50),
      supabase.from('wip_items').select('batch_number, model, quantity, current_stage, target_quantity').limit(30),
      supabase.from('finished_goods').select('recipeId, quantity, deliveredTo, qualityRemarks').limit(40),
      supabase.from('employee_tasks').select('title, assigned_to, due_date').or('completed.is.null,completed.eq.false').limit(30),
      isRestrictedRole ? Promise.resolve({ data: [] }) : supabase.from('price_list').select('model_name, price_without_gst').limit(30)
    ]);

    const totalRawUnits = (rgRes.data || []).reduce((acc: number, item: any) => acc + (Number(item.quantity) || 0), 0);
    const totalFinishedUnits = (fgRes.data || []).reduce((acc: number, item: any) => acc + (Number(item.quantity) || 0), 0);

    const plantContext = {
      summary: {
        total_raw_material_units: totalRawUnits,
        total_finished_battery_units: totalFinishedUnits,
        total_active_wip_batches: wipRes.data?.length || 0,
        total_pending_tasks: tasksRes.data?.length || 0
      },
      raw_materials: rgRes.data || [],
      work_in_progress: wipRes.data || [],
      finished_goods: fgRes.data || [],
      pending_tasks: tasksRes.data || [],
      available_battery_models: pricesRes.data || []
    };

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const systemPrompt = `You are the AI Assistant for Datlion Cnergy Plant OS (Lithium Battery Pack & Clean Energy Manufacturing Plant).
Respond to the user's WhatsApp message accurately and concisely based on the REAL-TIME PLANT CONTEXT.

Staff Member: ${staffUser.name} (${staffUser.username})
User Role: ${staffUser.role}

Format your response cleanly for WhatsApp using standard formatting (*bold*, _italic_, bullet points, emojis).
Do not use raw HTML. Keep answers clear, accurate, and actionable.
${isRestrictedRole ? 'Note: Focus on physical stock, cell sorting, assembly stages, and task instructions. Do not discuss sensitive profit margins.' : ''}

REAL-TIME PLANT CONTEXT:
${JSON.stringify(plantContext, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { text: systemPrompt },
        { text: `Staff User (${staffUser.name}): "${text}"` }
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    });

    const replyText = response.text || 'Unable to generate plant summary at this time.';
    await sendWhatsAppMessage(senderPhone, replyText, phoneNumberId);
  } catch (err: any) {
    await sendWhatsAppMessage(senderPhone, `⚠️ Plant AI query failed: ${err.message}`, phoneNumberId);
  }
}

// --- WORKFLOW 5: External Customer Assistant ---
async function handleExternalCustomerMessage(senderPhone: string, senderName: string, text: string, phoneNumberId: string) {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // If greeting or generic inquiry, send standard branded portal menu
  if (['hi', 'hello', 'hey', 'start', 'help', 'menu', 'contact', 'support', 'warranty', 'calculator', 'solar', 'battery'].some(w => lower.includes(w)) || clean.length < 15) {
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

    return await sendWhatsAppMessage(senderPhone, customerMenu, phoneNumberId);
  }

  // Use Gemini to answer customer product/solar questions politely and guide to links
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const customerPrompt = `You are the Customer Support Assistant for Datlion Cnergy (a leading Indian manufacturer of Lithium Iron Phosphate (LiFePO4) Battery Packs, Solar Inverters, and Clean Energy Storage Systems).

Your goal: Provide helpful, courteous, and accurate customer guidance.
Always guide customers to our official portals when relevant:
- Warranty / RMA / Service Support: https://support.cnergy.co.in
- Product Catalog & Specs: https://cnergy.co.in
- Solar Sizing & Savings Calculator: https://solarcalculator.cnergy.co.in
- Sales Email: sales@cnergy.co.in

IMPORTANT SECURITY RULE: Never disclose internal factory secrets, raw material procurement costs, supplier names, internal batch IDs, or employee tasks.

Format cleanly for WhatsApp with *bold* and bullet points.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { text: customerPrompt },
        { text: `Customer (${senderName}): "${clean}"` }
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 1024
      }
    });

    const reply = response.text || 'Thank you for contacting Datlion Cnergy! Please visit https://cnergy.co.in or contact support@cnergy.co.in.';
    await sendWhatsAppMessage(senderPhone, reply, phoneNumberId);
  } catch (err: any) {
    const fallback = `👋 Thank you for contacting Datlion Cnergy! For warranty and support, please visit https://support.cnergy.co.in or explore products at https://cnergy.co.in.`;
    await sendWhatsAppMessage(senderPhone, fallback, phoneNumberId);
  }
}

// --- Internal Welcome / Help Menu (Personalized & Role-Aware) ---
async function sendInternalHelpMenu(senderPhone: string, staffUser: StaffIdentity, phoneNumberId: string) {
  const roleLabel =
    staffUser.role === 'admin'
      ? '👑 Director Admin'
      : staffUser.role === 'billing'
      ? '💼 Billing & Operations'
      : staffUser.role === 'dashboard_user'
      ? '📊 Dashboard Data Employee'
      : '🔧 General Production Staff';

  let roleSpecificSections = '';

  if (staffUser.role === 'admin' || staffUser.role === 'billing') {
    roleSpecificSections = `📄 *1. Invoicing & Expense OCR*
• Forward any *Invoice PDF*, *Supplier Bill*, or *Receipt Photo*.
• Bills ≤ ₹5,000 auto-approve directly to ledger; > ₹5,000 queue for review.

🧾 *2. Fast Quotations & POs*
• Create drafts: _"Create quotation for 10 units 48V 100Ah for Tata Power"_
• Create PO: _"Draft PO for 5000 EVE 3.2V 100Ah cells"_

📦 *3. Plant & Stock Intelligence*
• Ask questions like:
  - _"What is our raw material inventory level?"_
  - _"Show WIP batches in production"_
  - _"How many finished battery packs are in stock?"_

📋 *4. Task Management*
• View all plant tasks: _"Show pending tasks"_
• View your tasks: _"My tasks"_
• View specific employee: _"Tasks for Ajay"_
• Add task: _"Add task: Sort Grade-A cells for Sanjay due tomorrow"_
• Complete task: _"Done <task ID or name>"_`;
  } else {
    // General Employee (role: user or dashboard_user)
    roleSpecificSections = `📋 *1. Your Assigned Tasks*
• View your work: _"My tasks"_ or _"Show my tasks"_
• Complete task: _"Done <task ID or name>"_ (e.g. _"Done Cell sorting"_)

📦 *2. Plant Floor & Stock Check*
• Ask questions like:
  - _"How many 3.2V 100Ah cells in stock?"_
  - _"Show active assembly batches"_
  - _"Where is storage rack B2 located?"_

📄 *3. Submit Inward Supplier Bills / Delivery Challans*
• Forward a photo or PDF of received material bills for automatic OCR entry.`;
  }

  const menu = `⚡ *Datlion Cnergy Plant OS*
👋 Hello *${staffUser.name}*! (${roleLabel})

Here is what you can do directly from this WhatsApp chat:

${roleSpecificSections}

💬 _Simply type your command or send a document/photo to start!_`;

  await sendWhatsAppMessage(senderPhone, menu, phoneNumberId);
}

// --- Central Text Message Router for Internal Staff ---
async function processInternalText(senderPhone: string, staffUser: StaffIdentity, text: string, phoneNumberId: string) {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Help & Greetings
  if (['hi', 'hello', 'hey', 'help', 'menu', 'options', 'start', 'commands'].includes(lower)) {
    return await sendInternalHelpMenu(senderPhone, staffUser, phoneNumberId);
  }

  // 2. Task Listing (Handles "tasks for ...", "my tasks", "pending tasks", etc.)
  if (
    lower.startsWith('task') || 
    lower.startsWith('show task') || 
    lower.startsWith('list task') || 
    lower.includes('tasks for') ||
    lower.includes('my tasks') || 
    lower.includes('pending tasks') ||
    lower.includes("today's tasks") ||
    lower.includes("todays tasks")
  ) {
    // If it's a creation command like "add task" or "create task", route to creation
    if (lower.startsWith('add task') || lower.startsWith('create task') || lower.startsWith('new task') || lower.startsWith('assign task')) {
      return await handleCreateTask(senderPhone, staffUser.name, clean, phoneNumberId);
    }

    // Extract user filter if present
    let filterUser: string | undefined;
    if (lower.includes('my tasks') || lower === 'tasks' || lower === 'task') {
      filterUser = staffUser.role === 'user' ? staffUser.name : undefined;
    } else if (lower.includes('for ')) {
      filterUser = lower.split('for ')[1].trim();
    } else if (lower.includes('tasks of ')) {
      filterUser = lower.split('tasks of ')[1].trim();
    }

    return await handleListTasks(senderPhone, staffUser, phoneNumberId, filterUser);
  }

  // 3. Task Completion
  if (lower.startsWith('done ') || lower.startsWith('complete ') || lower.startsWith('finish ') || lower.startsWith('mark done') || lower.startsWith('mark completed')) {
    return await handleCompleteTask(senderPhone, clean, phoneNumberId);
  }

  // 4. Task Creation
  if (lower.startsWith('add task') || lower.startsWith('create task') || lower.startsWith('new task') || lower.startsWith('assign task')) {
    return await handleCreateTask(senderPhone, staffUser.name, clean, phoneNumberId);
  }

  // 5. Quotation or PO Generation
  if (lower.startsWith('create quotation') || lower.startsWith('draft quote') || lower.startsWith('draft quotation') || lower.startsWith('create po') || lower.startsWith('draft po')) {
    return await handleCreateQuotationDraft(senderPhone, staffUser, clean, phoneNumberId);
  }

  // 6. Default: General Plant AI & Inventory Intelligence
  return await handlePlantAiQuery(senderPhone, staffUser, clean, phoneNumberId);
}

// --- Main HTTP Request Handler ---
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

  // --- POST: Incoming WhatsApp Event ---
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

      // Dynamic User Recognition from Supabase app_users table
      const staffUser = await getStaffUserByPhone(senderPhone, senderName);

      // --- BRANCH 1: Document / Image Sent ---
      if (message.type === 'document' || message.type === 'image') {
        if (!staffUser) {
          // External customer sent a document
          const externalDocMsg = `📄 *Document Received!*

Thank you *${senderName}* for reaching out to Datlion Cnergy.

If this document is for *Warranty, RMA, or Service Support*, please upload it to our dedicated support portal:
👉 https://support.cnergy.co.in

For Sales inquiries, please email sales@cnergy.co.in.`;
          await sendWhatsAppMessage(senderPhone, externalDocMsg, phoneNumberId);
          return res.status(200).send('EVENT_RECEIVED');
        }

        // Internal staff sent an invoice or bill
        const mediaId = message.document?.id || message.image?.id;
        const mimeType = message.document?.mime_type || message.image?.mime_type || 'application/pdf';
        const filename = message.document?.filename || (message.type === 'image' ? 'bill.jpg' : 'invoice.pdf');

        if (mediaId) {
          sendWhatsAppMessage(
            senderPhone,
            `⏳ *Document Received from ${staffUser.name}!* Analyzing with Cnergy AI OCR...`,
            phoneNumberId
          ).catch(() => {});

          waitUntil(
            processInboundInvoice(
              senderPhone,
              staffUser.name,
              mediaId,
              filename,
              mimeType,
              phoneNumberId
            )
          );
        }

        return res.status(200).send('EVENT_RECEIVED');
      }

      // --- BRANCH 2: Text Message Sent ---
      if (message.type === 'text') {
        const textBody = message.text?.body || '';

        if (staffUser) {
          // Internal DC Workflows (Tasks, Invoices, Plant AI, Quotations)
          waitUntil(
            processInternalText(
              senderPhone,
              staffUser,
              textBody,
              phoneNumberId
            )
          );
        } else {
          // External Customer Workflow (Support, Products, Solar Calculator)
          waitUntil(
            handleExternalCustomerMessage(
              senderPhone,
              senderName,
              textBody,
              phoneNumberId
            )
          );
        }

        return res.status(200).send('EVENT_RECEIVED');
      }

      return res.status(200).send('EVENT_RECEIVED');
    } catch (err: any) {
      console.error('[WhatsApp Webhook Error]:', err);
      return res.status(200).send('EVENT_RECEIVED');
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
