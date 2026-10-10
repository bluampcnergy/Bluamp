import { ExtractedInvoice } from "../types";

const cleanAndParseJSON = (raw: string) => {
    let text = raw.trim();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    return JSON.parse(text);
};

export const extractInvoiceData = async (
    fileBase64: string,
    mimeType: string,
    filename: string
): Promise<ExtractedInvoice> => {
    try {
        const prompt = `You are a highly precise AI assistant that extracts data from invoices, bills, purchase orders, quotes, and proformas into a strictly structured JSON format. ...`; // Kept brief for prompt, the server-side will handle schema if needed. 
        // Wait, the proxy expects the prompt AND schema to be sent from the client.
        // Let's send the full prompt and schema to the proxy.

        const invoiceSchema = {
            type: "object",
            properties: {
                document_type: { type: "string", enum: ["invoice", "delivery_challan", "receipt", "credit_note", "debit_note", "other"] },
                source_type: { type: "string", enum: ["sales", "purchase"] },
                issuer_details: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        gstin: { type: "string" },
                        address: { type: "string" },
                        state: { type: "string" },
                        state_code: { type: "string" },
                        email: { type: "string" },
                        phone: { type: "string" },
                        contact_person: { type: "string" }
                    }
                },
                receiver_details: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        gstin: { type: "string" },
                        address: { type: "string" },
                        state: { type: "string" },
                        state_code: { type: "string" },
                        email: { type: "string" },
                        phone: { type: "string" },
                        contact_person: { type: "string" }
                    }
                },
                invoice_metadata: {
                    type: "object",
                    properties: {
                        invoice_number: { type: "string" },
                        invoice_date: { type: "string" },
                        due_date: { type: "string" },
                        purchase_order_number: { type: "string" },
                        ewaybill_number: { type: "string" },
                        input_tax_credit: { type: "string", enum: ["set_off", "non_set_off", "not_applicable"] },
                        related_invoice_number: { type: "string" },
                        note_reason: { type: "string" }
                    }
                },
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            description: { type: "string" },
                            item_type: { type: "string", enum: ["Cell", "BMS", "Bat-misc"] },
                            make_model: { type: "string" },
                            status: { type: "string" },
                            hsn_sac: { type: "string" },
                            quantity: { type: "number" },
                            unit_price: { type: "number" },
                            taxable_value: { type: "number" },
                            cgst_rate: { type: "number" },
                            cgst_amount: { type: "number" },
                            sgst_rate: { type: "number" },
                            sgst_amount: { type: "number" },
                            igst_rate: { type: "number" },
                            igst_amount: { type: "number" },
                            total_value: { type: "number" }
                        }
                    }
                },
                totals: {
                    type: "object",
                    properties: {
                        subtotal_taxable: { type: "number" },
                        cgst_total: { type: "number" },
                        sgst_total: { type: "number" },
                        igst_total: { type: "number" },
                        round_off: { type: "number" },
                        grand_total: { type: "number" },
                        currency: { type: "string" }
                    }
                },
                ocr_confidence_score: { type: "number" },
                requires_review: { type: "boolean" }
            }
        };

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
           - Source Type: If issuer is "Bluamp Energy" or "Datlion Cnergy", 'sales'. If receiver is "Bluamp Energy" or "Datlion Cnergy" or document is from a vendor/supplier, 'purchase'. Default 'purchase'.
           - Document Type: If titled or labeled "Delivery Challan" or document number starts with "DCh", 'delivery_challan'. Default 'invoice'.
           - ITC: Default 'set_off' for purchases unless blocked.`;

        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'extractInvoiceData',
                payload: {
                    fileBase64,
                    mimeType,
                    prompt: fullPrompt,
                    schema: invoiceSchema
                }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to extract invoice');
        }

        const data = await response.json();
        const parsedData = cleanAndParseJSON(data.text);

        const invNum = (parsedData.invoice_metadata?.invoice_number || '').toUpperCase();
        const customTitle = ((parsedData.invoice_metadata as any)?.custom_title || '').toLowerCase();
        const isChallan = parsedData.document_type === 'delivery_challan' ||
            invNum.startsWith('DCH') ||
            filename.toLowerCase().includes('challan') ||
            filename.toLowerCase().includes('dch') ||
            customTitle.includes('challan');

        const issuerName = (parsedData.issuer_details?.name || '').toLowerCase();
        const isOurCompany = issuerName.includes('bluamp') || issuerName.includes('datlion') || issuerName.includes('cnergy');

        return {
          ...parsedData,
          document_type: isChallan
            ? (isOurCompany ? 'generated_delivery_challan' : 'delivery_challan')
            : (parsedData.document_type || 'invoice'),
          source_type: isOurCompany ? 'sales' : 'purchase',
          filename,
          timestamp: new Date().toISOString(),
          raw_text: "Stored securely", 
        };
    } catch (error: any) {
        console.error("Gemini Extraction Error:", error);
        throw new Error(`Gemini Extraction Failed: ${error.message}`);
    }
};

export const generateTextResponse = async (prompt: string): Promise<string> => {
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'generateTextResponse',
                payload: { prompt }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to generate text');
        }

        const data = await response.json();
        return data.text || "No response generated.";
    } catch (error: any) {
        console.error("Gemini Text Error:", error);
        return `Error: ${error.message}`;
    }
};

const aiAssistantSchema = {
    type: "object",
    properties: {
      document_type: { type: "string", enum: ["invoice", "delivery_challan", "po", "quotation", "proforma"] },
      template_name: { type: "string" },
      company_match: {
        type: "object",
        properties: {
          name: { type: "string" },
          is_new_company: { type: "boolean" }
        }
      },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity: { type: "number" },
            unit_price: { type: "number" },
            is_custom_product: { type: "boolean" }
          }
        }
      },
      ui_options: {
        type: "object",
        properties: {
          showReceiverSign: { type: "boolean" },
          showQRCode: { type: "boolean" },
          showTotalsTable: { type: "boolean" },
          showTaxTable: { type: "boolean" },
          terms: { type: "string" },
          visibleColumns: {
            type: "object",
            properties: {
              index: { type: "boolean" },
              description: { type: "boolean" },
              hsn: { type: "boolean" },
              quantity: { type: "boolean" },
              rate: { type: "boolean" },
              discount: { type: "boolean" },
              taxableValue: { type: "boolean" },
              total: { type: "boolean" }
            }
          }
        }
      }
    }
  };
  
export const generateInvoiceFromText = async (
    prompt: string, 
    context: {
        companies: string[];
        products: { model_name: string; price_without_gst: number }[];
        templates: string[];
    }
): Promise<any> => {
    try {
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

User Request: "${prompt}"`;

        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'generateInvoiceFromText',
                payload: {
                    prompt: systemPrompt,
                    schema: aiAssistantSchema
                }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to process AI assistant request');
        }

        const data = await response.json();
        return cleanAndParseJSON(data.text);
    } catch (error: any) {
        console.error("Gemini AI Assistant Error:", error);
        throw new Error(`AI Assistant Failed: ${error.message}`);
    }
};
