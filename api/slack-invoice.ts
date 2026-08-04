import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { waitUntil } from '@vercel/functions';

// IMPORTANT: VITE_* env vars are NOT available in Vercel serverless functions (they are build-time only).
// We must use the same hardcoded fallbacks as supabaseClient.ts to ensure database access always works.
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://supabase.cnergy.co.in';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

const supabase = createClient(supabaseUrl, supabaseKey);

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

const aiAssistantSchema = {
  type: Type.OBJECT,
  properties: {
    document_type: { type: Type.STRING, enum: ["invoice", "po", "quotation", "proforma"] },
    template_name: { type: Type.STRING, nullable: true },
    company_match: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        is_new_company: { type: Type.BOOLEAN }
      }
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit_price: { type: Type.NUMBER },
          is_custom_product: { type: Type.BOOLEAN }
        }
      }
    },
    ui_options: {
      type: Type.OBJECT,
      properties: {
        showReceiverSign: { type: Type.BOOLEAN, nullable: true },
        showQRCode: { type: Type.BOOLEAN, nullable: true },
        showTotalsTable: { type: Type.BOOLEAN, nullable: true },
        showTaxTable: { type: Type.BOOLEAN, nullable: true },
        terms: { type: Type.STRING, nullable: true },
        visibleColumns: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.BOOLEAN, nullable: true },
            description: { type: Type.BOOLEAN, nullable: true },
            hsn: { type: Type.BOOLEAN, nullable: true },
            quantity: { type: Type.BOOLEAN, nullable: true },
            rate: { type: Type.BOOLEAN, nullable: true },
            discount: { type: Type.BOOLEAN, nullable: true },
            taxableValue: { type: Type.BOOLEAN, nullable: true },
            total: { type: Type.BOOLEAN, nullable: true }
          }
        }
      }
    }
  }
};

function cleanAndParseJSON(raw: string) {
    let text = raw.trim();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    return JSON.parse(text);
}

async function processInvoice(userText: string, responseUrl: string) {
    try {
        const [companyResult, priceResult, templateResult] = await Promise.all([
          supabase.from('company_profiles').select('name'),
          supabase.from('price_list').select('model_name, price_without_gst'),
          supabase.from('invoice_templates').select('name')
        ]);

        // Log errors if any query failed
        if (companyResult.error) console.error('[Slack] company_profiles query failed:', companyResult.error);
        if (priceResult.error) console.error('[Slack] price_list query failed:', priceResult.error);
        if (templateResult.error) console.error('[Slack] invoice_templates query failed:', templateResult.error);
    
        const context = {
          companies: (companyResult.data || []).map((c: any) => c.name).filter(Boolean),
          products: (priceResult.data || []).map((p: any) => ({ model_name: p.model_name, price_without_gst: p.price_without_gst })),
          templates: (templateResult.data || []).map((t: any) => t.name).filter(Boolean)
        };

        // Diagnostic: log context sizes so we can verify data is flowing
        console.log(`[Slack] Context loaded — Companies: ${context.companies.length}, Products: ${context.products.length}, Templates: ${context.templates.length}`);
    
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        
        const systemPrompt = `You are an AI Invoice Assistant for the Datlion Cnergy Plant OS. Your job is to translate a user's natural language request into a strict JSON payload that will be used to automatically fill out an Invoice/Quotation form.
    
    You will be provided with the following SYSTEM CONTEXT (data currently in the database):
    [COMPANIES]: ${JSON.stringify(context.companies)}
    [PRODUCTS]: ${JSON.stringify(context.products)}
    [TEMPLATES]: ${JSON.stringify(context.templates)}
    
    Follow these strict rules:
    
    1. **DOCUMENT TYPE**: Extract the document type. Must be one of: 'invoice', 'po', 'quotation', 'proforma'. Default is 'invoice'.
    2. **CUSTOMER/COMPANY**: Attempt to match the customer/supplier mentioned by the user to the closest name in the [COMPANIES] list. If found, return the exact matched name. If the user mentions a completely new company, return exactly what the user typed.
    3. **LINE ITEMS (PRODUCTS)**:
       - For each product requested, try to match it to the closest product in the [PRODUCTS] list. If a match is found, return the exact model_name and its corresponding price_without_gst as the unit_price.
       - **CUSTOM PRODUCTS**: If the user asks for a product that clearly does NOT exist in the [PRODUCTS] list, DO NOT force a match. Return the custom description exactly as the user requested and set the unit_price based on user input (or 0 if not provided). Set is_custom_product: true.
       - Ensure you parse the requested quantity for each item (default to 1).
    4. **TEMPLATE**: If the user requests a specific template (e.g., "use template GST invoices"), match it against the [TEMPLATES] list and return the exact template name.
    5. **UI CONFIGURATION OPTIONS**: 
       The system supports the following toggles. If the user explicitly asks to hide or show certain elements, adjust these boolean flags accordingly. If not mentioned, return them as null:
       - showReceiverSign
       - showQRCode
       - showTotalsTable
       - showTaxTable
       - terms (string if they ask to add/edit terms)
       - visibleColumns (index, description, hsn, quantity, rate, discount, taxableValue, total)
    
    User Request: "${userText}"`;
    
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: systemPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: aiAssistantSchema,
                temperature: 0.1,
            },
        });
    
        const parsedData = cleanAndParseJSON(response.text || '{}');
        console.log('[Slack] AI Response:', JSON.stringify(parsedData));
    
        const draftPayload = {
          filename: 'AI_Assistant_Draft',
          document_type: 'generated_invoice',
          source_type: 'sales',
          requires_review: true,
          raw_text: 'Generated by AI Assistant via Slack',
          uploaded_by: 'slack_bot',
          invoice_metadata: {
            invoice_number: `SLACK-${Math.floor(Math.random() * 10000)}`,
            ui_config: {},
            slack_ai_payload: parsedData
          },
          items: [], 
          totals: { subtotal_taxable: 0, cgst_total: 0, sgst_total: 0, igst_total: 0, grand_total: 0 }
        };
    
        const { data: dbData, error } = await supabase.from('invoices').insert([draftPayload]).select().single();
    
        if (error) {
          console.error('Supabase insert error:', error);
          await sendToSlack(responseUrl, "An error occurred while saving the draft to the database.");
          return;
        }
    
        const appUrl = process.env.VITE_APP_URL || 'https://inventory.cnergy.co.in';
        const invoiceUrl = `${appUrl}/?view=finance_maker&slack_draft=${dbData.id}`; 
    
        const slackResponse = {
          response_type: "in_channel",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Invoice Draft Generated!*\nI've created a draft based on your request.\n\n*Document Type:* ${parsedData.document_type}\n*Customer:* ${parsedData.company_match?.name || 'Not specified'}\n*Items:* ${parsedData.items?.length || 0} items added.`
              }
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "Open Invoice Maker",
                    emoji: true
                  },
                  value: "open_invoice",
                  url: invoiceUrl,
                  style: "primary"
                }
              ]
            }
          ]
        };
        
        await sendToSlack(responseUrl, slackResponse);

    } catch (err: any) {
        console.error('Slack Background Error:', err);
        await sendToSlack(responseUrl, `Oops, something went wrong: ${err.message}`);
    }
}

async function sendToSlack(responseUrl: string, message: any) {
    if (!responseUrl) return;
    const body = typeof message === 'string' ? { text: message, response_type: "in_channel" } : message;
    await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

export default async function handler(req: any, res: any) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    if (req.body.type === 'url_verification') {
      return res.status(200).json({ challenge: req.body.challenge });
    }

    let userText = '';
    let responseUrl = '';
    
    if (req.body.event && req.body.event.type === 'message') {
      if (req.body.event.bot_id) {
        return res.status(200).send('OK');
      }
      userText = req.body.event.text;
    } else if (req.body.text) {
      userText = req.body.text;
      responseUrl = req.body.response_url; // Slash commands provide this
    } else {
      userText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    if (!userText) {
      return res.status(200).send('No text provided');
    }

    // Pass task to background execution to avoid 3000ms Slack timeout
    if (responseUrl) {
      waitUntil(processInvoice(userText, responseUrl));
      
      // Reply immediately
      return res.status(200).json({
          response_type: "ephemeral",
          text: "I'm working on that invoice for you! Give me a few seconds..."
      });
    } else {
       // If no response URL (like in Event API without direct response URL hook), try to run synchronously
       // (This shouldn't happen often if we use slash commands)
       return res.status(200).send("Command received, but response_url was missing.");
    }
  } catch (err: any) {
    console.error('Slack Handler Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
