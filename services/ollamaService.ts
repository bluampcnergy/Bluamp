
import { ExtractedInvoice, EMPTY_INVOICE } from "../types";

// Hardcoded defaults provided by user for seamless deployment
// NOTE: https://api.ollama.com is NOT a valid inference URL. Defaulting to standard local port.
const HARDCODED_DEFAULTS = {
    url: "http://localhost:11434", 
    model: "qwen3-vl:235b-cloud",
    key: "" // Users should provide their own API key via Settings UI
};

// Prefer user-defined env vars, fallback to hardcoded
const getEnvVar = (key: string, fallback: string) => {
    // Safely access env to prevent crash if undefined
    const val = (import.meta as any).env?.[key];
    return val || fallback;
};

const DEFAULT_URL = getEnvVar('VITE_OLLAMA_URL', HARDCODED_DEFAULTS.url);
const DEFAULT_MODEL = getEnvVar('VITE_OLLAMA_MODEL', HARDCODED_DEFAULTS.model); 
const DEFAULT_KEY = getEnvVar('VITE_OLLAMA_API_KEY', HARDCODED_DEFAULTS.key);

// Clean URL helper
const cleanUrl = (url?: string): string => {
    let clean = (url || DEFAULT_URL).trim();
    // Remove trailing slashes
    clean = clean.replace(/\/+$/, "");
    // Remove endpoints if user pasted full path
    if (clean.endsWith("/api/chat")) clean = clean.replace("/api/chat", "");
    if (clean.endsWith("/api/tags")) clean = clean.replace("/api/tags", "");
    return clean;
};

// Helper to determine if error is CORS or Network
const diagnoseConnectionError = async (baseUrl: string): Promise<string> => {
    if (baseUrl.includes("api.ollama.com")) {
        return "Configuration Error: 'https://api.ollama.com' is not a valid inference endpoint. If running locally, use 'http://localhost:11434'. If using a cloud provider, check their API documentation for the correct Endpoint URL.";
    }

    // 1. Check Mixed Content
    if (window.location.protocol === 'https:' && baseUrl.startsWith('http:')) {
        return "Mixed Content Error: Cannot access HTTP server from HTTPS app. Use HTTPS or localhost.";
    }

    try {
        // Attempt no-cors fetch to root or api/tags. If this doesn't throw, server is reachable.
        await fetch(`${baseUrl}/api/tags`, { mode: 'no-cors' });
        return "CORS Error: Server is online but blocking the request. Ensure the server has OLLAMA_ORIGINS=\"*\" set.";
    } catch (e) {
        // If no-cors fails, it's a network level issue (DNS, Connection Refused, SSL)
        return `Network Error: Unable to connect to ${baseUrl}. Server may be down, invalid URL, or blocked by browser/firewall.`;
    }
};

export const testOllamaConnection = async (
    customBaseUrl?: string, 
    apiKey?: string
): Promise<{ success: boolean; message: string }> => {
    const baseUrl = cleanUrl(customBaseUrl);
    const key = apiKey || DEFAULT_KEY;
    
    if (baseUrl.includes("api.ollama.com")) {
        return { success: false, message: "Invalid URL: api.ollama.com is not for chat/inference." };
    }

    const headers: Record<string, string> = {};
    if (key && key.trim() !== "") {
        headers["Authorization"] = `Bearer ${key}`;
    }

    try {
        // Strategy 1: Standard Check (Preferred)
        const response = await fetch(`${baseUrl}/api/tags`, { method: "GET", headers });
        if (response.ok) return { success: true, message: "Connection successful!" };
        
        // Strategy 2: Version Endpoint (Fallback)
        try {
            const verResponse = await fetch(`${baseUrl}/api/version`, { method: "GET", headers });
            if (verResponse.ok) return { success: true, message: "Connection successful! (via /api/version)" };
        } catch (e) { /* ignore */ }

        // If we reached here, server responded but with error (e.g. 404, 403, 500)
        return { success: false, message: `Server reached but returned error: ${response.status} ${response.statusText}` };

    } catch (error: any) {
        const diagnosticMsg = await diagnoseConnectionError(baseUrl);
        return { success: false, message: diagnosticMsg };
    }
};

export const extractInvoiceDataLocal = async (
  fileBase64: string,
  mimeType: string,
  filename: string,
  customBaseUrl?: string,
  customModel?: string,
  apiKey?: string
): Promise<ExtractedInvoice> => {
  const baseUrl = cleanUrl(customBaseUrl);
  const endpoint = `${baseUrl}/api/chat`;
  const modelName = customModel || DEFAULT_MODEL;
  const key = apiKey || DEFAULT_KEY;

  if (baseUrl.includes("api.ollama.com")) {
      throw new Error("Invalid URL: https://api.ollama.com is not a valid chat endpoint.");
  }

  try {
    const prompt = `
    You are an expert OCR and Accounting AI. Analyze this image (Indian GST Invoice).
    
    Extract data into this exact JSON structure. Do not add markdown blocks. Just return the JSON object.
    
    CRITICAL INSTRUCTIONS:
    1. EXTRACT ALL ITEMS: Return every single line item in the invoice table. Do not summarize or limit to 5. If there are 30 items, return 30 items.
    2. TAXES: Extract GST Rate (%) and Amounts (CGST, SGST, IGST) for each item.
    
    Structure requirements:
    - "document_type": "invoice", "delivery_challan", "receipt", "credit_note"
    - "source_type": "sales" (if issuer is Bluamp Energy or Datlion Cnergy) or "purchase" (if receiver is Bluamp Energy / Datlion Cnergy or vendor bill). Default "purchase".
    - "issuer_details": { name, gstin, address, email, phone, contact_person }
    - "receiver_details": { name, gstin, address, email, phone, contact_person }
    - "invoice_metadata": { invoice_number, invoice_date (YYYY-MM-DD), input_tax_credit ("set_off" or "non_set_off") }
    - "items": Array of objects with:
        - item_type: "Cell", "BMS", or "Bat-misc" (Use Bat-misc for all non-cell/non-bms items).
        - description: Standardized name. 
            - For Cell: "[Size] [Capacity] [Chemistry] [Grade]" (e.g., "32700 6Ah LFP Solar").
            - For BMS: "[Series]S [Amps]A [Chemistry]" (e.g., "23S 30A LFP").
            - For others: Original description.
        - make_model (extract brand like EVE, Daly)
        - status (default "Not Damaged")
        - hsn_sac
        - quantity (number)
        - unit_price (number)
        - taxable_value (number)
        - cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount (numbers)
        - total_value (number)
    - "totals": { subtotal_taxable, cgst_total, sgst_total, igst_total, grand_total }
    
    If values are missing, use empty strings or 0. Remove currency symbols.
    `;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    if (key && key.trim() !== "") {
        headers["Authorization"] = `Bearer ${key}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: modelName,
        stream: false,
        format: "json",
        messages: [
          {
            role: "user",
            content: prompt,
            images: [fileBase64],
          },
        ],
        options: {
            temperature: 0.1,
            num_ctx: 4096 
        }
      }),
    });

    if (!response.ok) {
        let errorBody = "";
        try { errorBody = await response.text(); } catch (e) { errorBody = "Unknown error"; }
        throw new Error(`Ollama Error (${response.status}): ${response.statusText}. Details: ${errorBody}.`);
    }

    const data = await response.json();
    const rawContent = data.message?.content;

    if (!rawContent) {
        throw new Error("Local model returned empty response");
    }

    let parsedData: any;
    try {
        parsedData = JSON.parse(rawContent);
    } catch (e) {
        // Fallback: try to find JSON block
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[0]);
        } else {
            console.error("Raw Local Output:", rawContent);
            throw new Error("Could not parse JSON from local model output");
        }
    }

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
      ...EMPTY_INVOICE, 
      ...parsedData,
      document_type: isChallan
        ? (isOurCompany ? 'generated_delivery_challan' : 'delivery_challan')
        : (parsedData.document_type || 'invoice'),
      source_type: isOurCompany ? 'sales' : 'purchase',
      filename,
      timestamp: new Date().toISOString(),
      raw_text: `Extracted via Local Model (${modelName})`,
      ocr_confidence_score: 0.9, 
    };

  } catch (error: any) {
    console.error("Local Extraction Error:", error);
    
    // Provide diagnostic advice based on error type
    if (error.name === 'TypeError' || error.message.includes('Failed to fetch')) {
        const diagnosticMsg = await diagnoseConnectionError(baseUrl);
        throw new Error(diagnosticMsg);
    }
    
    throw error;
  }
};

export const generateTextResponseLocal = async (
  prompt: string,
  customBaseUrl?: string,
  customModel?: string,
  apiKey?: string
): Promise<string> => {
    const baseUrl = cleanUrl(customBaseUrl);
    const endpoint = `${baseUrl}/api/chat`;
    const modelName = customModel || DEFAULT_MODEL;
    const key = apiKey || DEFAULT_KEY;

    if (baseUrl.includes("api.ollama.com")) {
        throw new Error("Invalid URL: https://api.ollama.com is not a valid chat endpoint.");
    }

    try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        
        if (key && key.trim() !== "") {
            headers["Authorization"] = `Bearer ${key}`;
        }

        const response = await fetch(endpoint, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                model: modelName,
                stream: false,
                messages: [{ role: "user", content: prompt }],
                options: { temperature: 0.7 }
            }),
        });

        if (!response.ok) {
            let errorBody = "";
            try { errorBody = await response.text(); } catch (e) { errorBody = ""; }
            throw new Error(`Ollama Error (${response.status}): ${errorBody || response.statusText}`);
        }
        const data = await response.json();
        return data.message?.content || "No response.";
    } catch (error: any) {
        console.error("Local Chat Error:", error);
        if (error.name === 'TypeError' || error.message.includes('Failed to fetch')) {
             const diagnosticMsg = await diagnoseConnectionError(baseUrl);
             throw new Error(diagnosticMsg);
        }
        throw error;
    }
};
