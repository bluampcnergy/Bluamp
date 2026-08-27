import { GoogleGenAI, Type } from '@google/genai';
import { ExtractedInvoice, InvoiceItem } from '../types';
import { recalculateInvoiceTotals } from '../utils/invoiceUtils';

// --- Official Invoice Extraction JSON Schema for Gemini 2.5 Flash ---
export const invoiceExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    document_type: {
      type: Type.STRING,
      enum: ["invoice", "receipt", "credit_note", "debit_note", "purchase_order", "bill", "other"]
    },
    source_type: {
      type: Type.STRING,
      enum: ["sales", "purchase"]
    },
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
        state: { type: Type.STRING, nullable: true },
        state_code: { type: Type.STRING, nullable: true },
        email: { type: Type.STRING, nullable: true },
        phone: { type: Type.STRING, nullable: true }
      }
    },
    receiver_details: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        gstin: { type: Type.STRING, nullable: true },
        address: { type: Type.STRING, nullable: true },
        state: { type: Type.STRING, nullable: true },
        state_code: { type: Type.STRING, nullable: true },
        email: { type: Type.STRING, nullable: true },
        phone: { type: Type.STRING, nullable: true }
      }
    },
    invoice_metadata: {
      type: Type.OBJECT,
      properties: {
        invoice_number: { type: Type.STRING },
        invoice_date: { type: Type.STRING },
        due_date: { type: Type.STRING, nullable: true },
        purchase_order_number: { type: Type.STRING, nullable: true },
        ewaybill_number: { type: Type.STRING, nullable: true },
        input_tax_credit: {
          type: Type.STRING,
          enum: ["set_off", "non_set_off", "not_applicable"]
        },
        payment_mode: { type: Type.STRING, nullable: true }
      }
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          item_type: { type: Type.STRING, enum: ["Cell", "BMS", "Bat-misc", "Service", "Consumable", "Other"] },
          make_model: { type: Type.STRING, nullable: true },
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
        round_off: { type: Type.NUMBER, nullable: true },
        grand_total: { type: Type.NUMBER },
        currency: { type: Type.STRING }
      },
      required: ["subtotal_taxable", "grand_total"]
    },
    ocr_confidence_score: { type: Type.NUMBER },
    requires_review: { type: Type.BOOLEAN }
  },
  required: ["document_type", "source_type", "issuer_details", "receiver_details", "invoice_metadata", "items", "totals"]
};

export const INVOICE_SYSTEM_PROMPT = `You are a high-precision AI Invoice and Financial OCR Auditor for Datlion Cnergy (a clean energy and battery manufacturing company in India).
Your task is to analyze invoice images or PDF documents and produce a strict, valid JSON representation according to the schema.

CRITICAL EXTRACTION RULES:

1. **DOCUMENT & SOURCE TYPE CLASSIFICATION**:
   - Company Name: "Datlion Cnergy" / "Datlion Cnergy Private Limited"
   - If the ISSUER is "Datlion Cnergy" -> 'sales'.
   - If the RECEIVER / BUYER is "Datlion Cnergy" (or any supplier bill sent to Datlion Cnergy) -> 'purchase' (Expense).
   - If unsure, default to 'purchase'.

2. **EXPENSE CATEGORY AUTO-TAGGING**:
   - Classify the expense into one of:
     - 'raw_materials' (e.g. nickel strip, solder wire, epoxy, cables, connectors, casing, heat shrink)
     - 'battery_cells_bms' (e.g. 32700, 21700, 18650, prismatics, LFP cells, Daly/JBD Smart BMS)
     - 'logistics_transport' (e.g. courier, transport freight, V-Trans, DTDC, porter, delivery)
     - 'utilities_electricity' (e.g. MSEB, electricity bill, water, internet)
     - 'rent_facility' (e.g. factory rent, warehouse lease)
     - 'tools_equipment' (e.g. spot welder, multimeters, testing equipment, drills)
     - 'office_supplies' (e.g. stationery, printing, toner)
     - 'repairs_maintenance' (e.g. machine repairs, servicing)
     - 'professional_services' (e.g. CA, legal, consulting, software subscriptions)
     - 'other'

3. **LINE ITEMS (EVERY ROW MUST BE EXTRACTED)**:
   - Extract EVERY row into the 'items' array. Never summarize or omit line items.
   - For each item:
     - 'description': Clean, standardized product name.
     - 'item_type': 'Cell', 'BMS', 'Bat-misc', 'Service', 'Consumable', or 'Other'.
     - 'hsn_sac': 4, 6, or 8-digit HSN/SAC code if printed.
     - 'quantity', 'unit_price', 'taxable_value', 'total_value'.
     - 'cgst_rate', 'sgst_rate', 'igst_rate' (e.g., 9 for 9%, 18 for 18%).
     - 'cgst_amount', 'sgst_amount', 'igst_amount'.

4. **INDIAN GST TAXATION RULES**:
   - Intra-state (same state code in Issuer and Receiver GSTIN): CGST + SGST.
   - Inter-state (different state codes): IGST.
   - If only total GST rate is given (e.g. 18%) for intra-state: split into CGST 9% and SGST 9%.

5. **METADATA**:
   - Dates: Strict 'YYYY-MM-DD' format.
   - Numeric values: Strict numbers (no commas or currency symbols).
   - If invoice number is not clearly visible, generate a clean placeholder like 'BILL-YYYYMMDD'.`;

// --- Core Helper: Extract Invoice via Gemini 2.5 Flash ---
export async function extractInvoiceFromBufferWithGemini(
  fileBuffer: Buffer | string,
  mimeType: string,
  apiKey: string
): Promise<ExtractedInvoice> {
  const base64Data = typeof fileBuffer === 'string' ? fileBuffer : fileBuffer.toString('base64');
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: INVOICE_SYSTEM_PROMPT }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: invoiceExtractionSchema,
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  });

  let raw = response.text || '{}';
  raw = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(raw);

  // Recalculate totals for precision
  if (parsed.items && Array.isArray(parsed.items)) {
    const recalculated = recalculateInvoiceTotals(parsed.items);
    parsed.totals = {
      ...parsed.totals,
      ...recalculated
    };
  }

  return parsed as ExtractedInvoice;
}
