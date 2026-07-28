import { ExtractedInvoice } from "../types";

const EMPTY_INVOICE: Partial<ExtractedInvoice> = {
  document_type: "invoice",
  source_type: "purchase",
  issuer_details: { name: "", gstin: "", address: "", state: "", state_code: "", email: "", phone: "", contact_person: "" },
  receiver_details: { name: "", gstin: "", address: "", state: "", state_code: "", email: "", phone: "", contact_person: "" },
  invoice_metadata: { invoice_number: "", invoice_date: "", due_date: "", purchase_order_number: "", ewaybill_number: "", input_tax_credit: "set_off", related_invoice_number: "", note_reason: "" },
  items: [],
  totals: { subtotal_taxable: 0, cgst_total: 0, sgst_total: 0, igst_total: 0, round_off: 0, grand_total: 0, currency: "INR" },
};

export const extractInvoiceDataOpenRouter = async (
  fileBase64: string,
  mimeType: string,
  filename: string,
  apiKey?: string, // Deprecated, kept for signature compatibility
  model?: string
): Promise<ExtractedInvoice> => {
  const prompt = `You are a highly precise AI assistant that extracts data from invoices, bills, purchase orders, quotes, and proformas into a strictly structured JSON format. ...`; // Full prompt sent via frontend, backend handles generic routing. Wait, the frontend sends the prompt to the backend.

  const fullPrompt = `You are a highly precise AI assistant that extracts data from invoices, bills, purchase orders, quotes, and proformas into a strictly structured JSON format.

CRITICAL RULES:

1. **ITEMS ARRAY**: 
   - Extract EVERY SINGLE item row into the 'items' array. DO NOT summarize or skip rows.
   - If there are 28 rows, return 28 item objects.
   - Extract items even if they are NOT Cells or BMS (e.g. screws, wires, nickel, transport charges).

2. **TAXATION (IMPORTANT)**:
   - For EACH item, extract 'cgst_rate', 'sgst_rate', 'igst_rate' (percentages) and their amounts.
   - Look for columns like "GST %", "Tax Rate", "CGST Amt", "SGST Amt", "IGST Amt".
   - If only "GST Rate" is given (e.g. 18%) and it's an intra-state transaction, split it (CGST 9%, SGST 9%).
   - If inter-state, put it in IGST (18%).

3. **MASTER ITEM MAPPING / NAMING**:
   - 'item_type': Classify into 'Cell', 'BMS', or 'Bat-misc'.
     - Use 'Bat-misc' for EVERYTHING that is not strictly a Cell or BMS.
   - 'description': Standardize strictly based on 'item_type':
       A. If 'item_type' is 'Cell': Format as "[Size] [Capacity] [Chemistry] [Grade]" (e.g. "32700 6Ah LFP Solar").
       B. If 'item_type' is 'BMS': Format as "[Series]S [Amps]A [Chemistry]" (e.g. "23S 30A LFP").
       C. Otherwise: Use a clear, standardized version of the invoice item description.
   - 'make_model': Extract Brand Name (e.g. 'EVE', 'Daly').

4. **METADATA**:
   - Dates: YYYY-MM-DD.
   - Money: Numbers only (no symbols).
   - Source Type: If issuer is "Datlion Cnergy", 'sales'. If receiver is "Datlion Cnergy", 'purchase'. Default 'purchase'.
   - ITC: Default 'set_off' for purchases unless blocked.

Return a JSON object matching this schema exactly:
{
  "document_type": "invoice" | "receipt" | "credit_note" | "debit_note" | "other",
  "source_type": "sales" | "purchase",
  "issuer_details": {
    "name": string,
    "gstin": string,
    "address": string,
    "state": string,
    "state_code": string,
    "email": string,
    "phone": string,
    "contact_person": string
  },
  "receiver_details": {
    "name": string,
    "gstin": string,
    "address": string,
    "state": string,
    "state_code": string,
    "email": string,
    "phone": string,
    "contact_person": string
  },
  "invoice_metadata": {
    "invoice_number": string,
    "invoice_date": string,
    "due_date": string,
    "purchase_order_number": string,
    "ewaybill_number": string,
    "input_tax_credit": "set_off" | "non_set_off" | "not_applicable",
    "related_invoice_number": string,
    "note_reason": string
  },
  "items": [
    {
      "description": string,
      "item_type": "Cell" | "BMS" | "Bat-misc",
      "make_model": string,
      "status": string,
      "hsn_sac": string,
      "quantity": number,
      "unit_price": number,
      "taxable_value": number,
      "cgst_rate": number,
      "cgst_amount": number,
      "sgst_rate": number,
      "sgst_amount": number,
      "igst_rate": number,
      "igst_amount": number,
      "total_value": number
    }
  ],
  "totals": {
    "subtotal_taxable": number,
    "cgst_total": number,
    "sgst_total": number,
    "igst_total": number,
    "round_off": number,
    "grand_total": number,
    "currency": string
  },
  "ocr_confidence_score": number,
  "requires_review": boolean
}
`;

  try {
    const response = await fetch('/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'extractInvoiceData',
        payload: {
          prompt: fullPrompt,
          fileBase64,
          mimeType,
          model
        }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`OpenRouter Error: ${err.error || 'Unknown Error'}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new Error("OpenRouter model returned empty response");
    }

    const cleanAndParseJSON = (raw: string) => {
      let text = raw.trim();
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      
      const repairJSON = (jsonStr: string): string => {
        let inString = false;
        let escaped = false;
        const stack: string[] = [];
        
        for (let i = 0; i < jsonStr.length; i++) {
          const char = jsonStr[i];
          if (char === '"' && !escaped) inString = !inString;
          else if (!inString) {
            if (char === '{') stack.push('}');
            else if (char === '[') stack.push(']');
            else if (char === '}' || char === ']') {
              if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
            }
          }
          if (char === '\\' && !escaped) escaped = true; else escaped = false;
        }
        
        let repaired = jsonStr;
        if (inString) repaired += '"';
        while (stack.length > 0) repaired += stack.pop();
        return repaired;
      };

      try {
        return JSON.parse(text);
      } catch (e) {
        try {
          return JSON.parse(repairJSON(text));
        } catch (e2) {
          const firstOpen = text.indexOf('{');
          const lastClose = text.lastIndexOf('}');
          if (firstOpen !== -1 && lastClose !== -1) {
            const candidate = text.substring(firstOpen, lastClose + 1);
            try {
              return JSON.parse(repairJSON(candidate));
            } catch (e3) {
              console.error("OpenRouter JSON Parse Recovery Failed. Text:", text);
              throw e;
            }
          }
          throw e;
        }
      }
    };

    const parsedData = cleanAndParseJSON(rawContent);

    return {
      ...EMPTY_INVOICE,
      ...parsedData,
      filename,
      timestamp: new Date().toISOString(),
      raw_text: `Extracted via OpenRouter`,
      ocr_confidence_score: parsedData.ocr_confidence_score || 0.9,
    };

  } catch (error: any) {
    console.error("OpenRouter Extraction Error:", error);
    throw error;
  }
};

export const testOpenRouterConnection = async (
  apiKey?: string,
  model?: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch('/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'testConnection',
        payload: { model }
      })
    });

    if (response.ok) {
      return { success: true, message: "Connection to OpenRouter successful via proxy!" };
    }

    const err = await response.json();
    return { success: false, message: `Server reached but returned error: ${err.error}` };
  } catch (error: any) {
    return { success: false, message: `Network error connecting to OpenRouter proxy: ${error.message}` };
  }
};

export const generateTextResponseOpenRouter = async (
  prompt: string,
  apiKey?: string,
  model?: string
): Promise<string> => {
  try {
    const response = await fetch('/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generateTextResponse',
        payload: { prompt, model }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`OpenRouter Proxy Error: ${err.error}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No response.";
  } catch (error: any) {
    console.error("OpenRouter Chat Error:", error);
    throw error;
  }
};

export const generateRFQTextOpenRouter = async (params: {
  product: string;
  specification?: string;
  supplierName?: string;
  contactName?: string;
  quantity?: number;
  uom?: string;
}): Promise<string> => {
  const prompt = `Write a professional, polite Request for Quotation (RFQ) email body from Datlion Cnergy to vendor "${params.supplierName || 'Vendor'}" (Attention: ${params.contactName || 'Sales/Procurement Team'}).
Product: ${params.product}
Specification / Particulars: ${params.specification || 'Standard Datasheet Spec'}
Quantity Required: ${params.quantity ? `${params.quantity} ${params.uom || 'qty'}` : 'Bulk Procurement Quantity'}

Request formal unit pricing (excl & incl GST), bulk tier discounts, lead time/delivery timeline to our Pune facility, payment terms, and warranty period. Keep the tone professional, clear, and ready to send.`;

  try {
    const aiText = await generateTextResponseOpenRouter(prompt);
    if (aiText && aiText !== "No response.") {
      return aiText.trim();
    }
  } catch (err) {
    console.warn("AI RFQ generation fallback activated:", err);
  }

  // Robust Fallback Template
  return `Dear ${params.contactName || 'Sales Team'} (${params.supplierName || 'Supplier'}),

We at Datlion Cnergy would like to request an official Request for Quotation (RFQ) for the following item:

• Product: ${params.product}
• Specification / Particulars: ${params.specification || 'As per standard specification'}
• Quantity Required: ${params.quantity ? `${params.quantity} ${params.uom || 'qty'}` : 'Bulk requirement'}

Could you please share:
1. Official unit rate (excl. and incl. GST)
2. Lead time & delivery schedule for Pune plant
3. Applicable bulk discounts
4. Warranty & payment terms

Looking forward to your prompt response.

Best regards,
Procurement Team
Datlion Cnergy`;
};

export const CNERGY_EMAIL_SIGNATURE_URL = "https://bfkxdpripwjxenfvwpfu.supabase.co/storage/v1/object/public/Product%20drawings/Email_signature_3%20(1).png";
export const CNERGY_EMAIL_SIGNATURE_HTML = `<br/><br/><div class="cnergy-signature" style="margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;"><img src="${CNERGY_EMAIL_SIGNATURE_URL}" alt="Datlion Cnergy Signature" style="max-width:500px;width:100%;height:auto;display:block;border-radius:4px;" /></div>`;


