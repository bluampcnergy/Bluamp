
import { ExtractedInvoice, InvoiceItem } from "../types";

// --- Validation ---
export const validateGSTIN = (gstin: string): boolean => {
  if (!gstin) return true; // Empty is valid (unregistered)
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return regex.test(gstin);
};

// --- Tax Mode Helpers ---
export const getStateCodeFromGSTIN = (gstin: string | undefined): string | null => {
  if (!gstin || gstin.length < 2) return null;
  return gstin.substring(0, 2);
};

export const getTaxMode = (issuerGSTIN: string | undefined, receiverGSTIN: string | undefined, override?: 'intra' | 'inter'): 'intra' | 'inter' => {
  if (override) return override;
  const issuerState = getStateCodeFromGSTIN(issuerGSTIN);
  const receiverState = getStateCodeFromGSTIN(receiverGSTIN);
  if (issuerState && receiverState && issuerState !== receiverState) return 'inter';
  return 'intra';
};

export const calculateItemTotal = (item: InvoiceItem): number => {
  return (item.taxable_value || 0) + (item.cgst_amount || 0) + (item.sgst_amount || 0) + (item.igst_amount || 0);
};

export const recalculateInvoiceTotals = (items: InvoiceItem[]): any => {
  const raw = items.reduce(
    (acc, item) => {
      acc.subtotal_taxable += item.taxable_value || 0;
      acc.discount_total += item.discount || 0;
      acc.cgst_total += item.cgst_amount || 0;
      acc.sgst_total += item.sgst_amount || 0;
      acc.igst_total += item.igst_amount || 0;
      acc.raw_grand_total += calculateItemTotal(item);
      return acc;
    },
    {
      subtotal_taxable: 0,
      discount_total: 0,
      cgst_total: 0,
      sgst_total: 0,
      igst_total: 0,
      raw_grand_total: 0,
    }
  );
  const roundedGrandTotal = Math.ceil(raw.raw_grand_total);
  const rounding_adjustment = roundedGrandTotal - raw.raw_grand_total;
  return {
    subtotal_taxable: raw.subtotal_taxable,
    discount_total: raw.discount_total,
    cgst_total: raw.cgst_total,
    sgst_total: raw.sgst_total,
    igst_total: raw.igst_total,
    rounding_adjustment,
    grand_total: roundedGrandTotal,
  };
};

// --- Helper Functions ---

export const safeRender = (value: any): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

// --- Number to Words ---
function numberToWords(n: number, isIndianSystem: boolean = true): string {
  if (n === 0) return "Zero";

  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const numToWordsLessThan1000 = (num: number): string => {
    if (num === 0) return "";
    let res = "";
    if (num >= 100) {
      res += units[Math.floor(num / 100)] + " Hundred ";
      num %= 100;
    }
    if (num > 0) {
      if (num < 20) res += units[num];
      else {
        const t = Math.floor(num / 10);
        const u = num % 10;
        res += tens[t] + (u > 0 ? " " + units[u] : "");
      }
    }
    return res.trim();
  };

  if (isIndianSystem) {
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const hundred = Math.floor(n / 100);
    n %= 100;

    let str = "";
    if (crore > 0) str += numToWordsLessThan1000(crore) + " Crore ";
    if (lakh > 0) str += numToWordsLessThan1000(lakh) + " Lakh ";
    if (thousand > 0) str += numToWordsLessThan1000(thousand) + " Thousand ";
    if (hundred > 0) str += numToWordsLessThan1000(hundred) + " Hundred ";
    if (n > 0) str += numToWordsLessThan1000(n);
    return str.trim();
  } else {
    // International System
    const chunks: string[] = [];
    const scales = ["", "Thousand", "Million", "Billion", "Trillion"];
    let i = 0;
    while (n > 0) {
      const chunk = n % 1000;
      if (chunk > 0) {
        const chunkStr = numToWordsLessThan1000(chunk);
        chunks.unshift(chunkStr + (scales[i] ? " " + scales[i] : ""));
      }
      n = Math.floor(n / 1000);
      i++;
    }
    return chunks.join(" ").trim();
  }
}

export const getCurrencySymbol = (currency?: string): string => {
  switch (currency) {
    case 'USD': return '$';
    case 'RMB': return '¥';
    case 'INR':
    default: return '₹';
  }
};

export const amountToWords = (amount: number, currency: string = 'INR'): string => {
  const whole = Math.floor(amount);
  const fraction = Math.round((amount - whole) * 100);
  const isIndian = currency === 'INR';

  let mainUnit = "Rupees";
  let fractionalUnit = "Paise";

  if (currency === 'USD') {
      mainUnit = "Dollars";
      fractionalUnit = "Cents";
  } else if (currency === 'RMB') {
      mainUnit = "Yuan";
      fractionalUnit = "Fen";
  }

  let str = numberToWords(whole, isIndian) + " " + mainUnit;
  if (fraction > 0) {
    str += " and " + numberToWords(fraction, isIndian) + " " + fractionalUnit;
  }
  return str + " Only";
};

// --- Export Helper ---

export const generateCSV = (invoices: ExtractedInvoice[]): string => {
  const headers = [
    "Invoice Number",
    "Date",
    "Type",
    "Issuer Name",
    "Issuer GSTIN",
    "Receiver Name",
    "Receiver GSTIN",
    "Item Description",
    "HSN/SAC",
    "Quantity",
    "Unit Price",
    "Taxable Value",
    "CGST Rate",
    "CGST Amount",
    "SGST Rate",
    "SGST Amount",
    "IGST Rate",
    "IGST Amount",
    "Total Value"
  ];

  const rows: string[] = [];
  rows.push(headers.join(","));

  invoices.forEach(inv => {
    const items = inv.items && inv.items.length > 0 ? inv.items : [];

    if (items.length === 0) {
      const row = [
        `"${inv.invoice_metadata?.invoice_number || ''}"`,
        `"${inv.invoice_metadata?.invoice_date || ''}"`,
        `"${inv.source_type || ''}"`,
        `"${inv.issuer_details?.name || ''}"`,
        `"${inv.issuer_details?.gstin || ''}"`,
        `"${inv.receiver_details?.name || ''}"`,
        `"${inv.receiver_details?.gstin || ''}"`,
        "Summary - No Items", "", "", "",
        inv.totals?.subtotal_taxable || 0,
        "", inv.totals?.cgst_total || 0,
        "", inv.totals?.sgst_total || 0,
        "", inv.totals?.igst_total || 0,
        `"${inv.totals?.grand_total || 0}"`
      ];
      rows.push(row.join(","));
    } else {
      items.forEach(item => {
        const row = [
          `"${inv.invoice_metadata?.invoice_number || ''}"`,
          `"${inv.invoice_metadata?.invoice_date || ''}"`,
          `"${inv.source_type || ''}"`,
          `"${inv.issuer_details?.name || ''}"`,
          `"${inv.issuer_details?.gstin || ''}"`,
          `"${inv.receiver_details?.name || ''}"`,
          `"${inv.receiver_details?.gstin || ''}"`,
          `"${(item.description || '').replace(/"/g, '""')}"`,
          `"${item.hsn_sac || ''}"`,
          item.quantity || 0,
          item.unit_price || 0,
          item.taxable_value || 0,
          item.cgst_rate || 0,
          item.cgst_amount || 0,
          item.sgst_rate || 0,
          item.sgst_amount || 0,
          item.igst_rate || 0,
          item.igst_amount || 0,
          item.total_value || 0
        ];
        rows.push(row.join(","));
      });
    }
  });

  return rows.join("\n");
};

export const generateCompanyProfileCSV = (invoices: ExtractedInvoice[]): string => {
  const headers = [
    "Company Name",
    "GST Number",
    "Email",
    "Contact Person",
    "Phone Number",
    "Shipping Address"
  ];

  const companyMap = new Map<string, any>();

  invoices.forEach(inv => {
    if (inv.source_type === 'purchase') {
      const party = inv.issuer_details;
      const key = party.gstin || party.name;
      if (key) {
        companyMap.set(key, party);
      }
    }
    else if (inv.source_type === 'sales') {
      const party = inv.receiver_details;
      const key = party.gstin || party.name;
      if (key) {
        companyMap.set(key, party);
      }
    }
  });

  const rows: string[] = [];
  rows.push(headers.join(","));

  companyMap.forEach((party) => {
    const row = [
      `"${(party.name || '').replace(/"/g, '""')}"`,
      `"${(party.gstin || '').replace(/"/g, '""')}"`,
      `"${(party.email || '').replace(/"/g, '""')}"`,
      `"${(party.contact_person || '').replace(/"/g, '""')}"`,
      `"${(party.phone || '').replace(/"/g, '""')}"`,
      `"${(party.address || '').replace(/"/g, '""')}"`
    ];
    rows.push(row.join(","));
  });

  return rows.join("\n");
};

export const downloadFile = (content: string, filename: string, type: 'csv' | 'json') => {
  const mimeType = type === 'csv' ? 'text/csv' : 'application/json';
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export interface InvoiceDiffResult {
  summary: string;
  changes: string[];
}

export const computeInvoiceChanges = (
  oldDoc: ExtractedInvoice | null | undefined,
  newDoc: ExtractedInvoice,
  oldConfig?: any,
  newConfig?: any
): InvoiceDiffResult => {
  const changes: string[] = [];

  if (!oldDoc) {
    return {
      summary: "Created document",
      changes: ["Initial document created"]
    };
  }

  // 1. Document Metadata Changes
  const oldMeta = (oldDoc.invoice_metadata || {}) as Partial<ExtractedInvoice['invoice_metadata']>;
  const newMeta = (newDoc.invoice_metadata || {}) as Partial<ExtractedInvoice['invoice_metadata']>;

  if ((oldMeta.invoice_number || '').trim() !== (newMeta.invoice_number || '').trim()) {
    changes.push(`Invoice Number: "${oldMeta.invoice_number || '-'}" ➔ "${newMeta.invoice_number || '-'}"`);
  }

  if ((oldMeta.invoice_date || '') !== (newMeta.invoice_date || '')) {
    changes.push(`Invoice Date: "${oldMeta.invoice_date || '-'}" ➔ "${newMeta.invoice_date || '-'}"`);
  }

  if ((oldMeta.due_date || '') !== (newMeta.due_date || '')) {
    changes.push(`Due Date: "${oldMeta.due_date || '-'}" ➔ "${newMeta.due_date || '-'}"`);
  }

  if ((oldMeta.purchase_order_number || '') !== (newMeta.purchase_order_number || '')) {
    changes.push(`PO Number: "${oldMeta.purchase_order_number || '-'}" ➔ "${newMeta.purchase_order_number || '-'}"`);
  }

  if ((oldMeta.ewaybill_number || '') !== (newMeta.ewaybill_number || '')) {
    changes.push(`E-Way Bill: "${oldMeta.ewaybill_number || '-'}" ➔ "${newMeta.ewaybill_number || '-'}"`);
  }

  if ((oldMeta.related_invoice_number || '') !== (newMeta.related_invoice_number || '')) {
    changes.push(`Reference Invoice #: "${oldMeta.related_invoice_number || '-'}" ➔ "${newMeta.related_invoice_number || '-'}"`);
  }

  if ((oldMeta.note_reason || '') !== (newMeta.note_reason || '')) {
    changes.push(`Note Reason: "${oldMeta.note_reason || '-'}" ➔ "${newMeta.note_reason || '-'}"`);
  }

  if ((oldMeta.tax_mode || '') !== (newMeta.tax_mode || '')) {
    changes.push(`Tax Mode: ${oldMeta.tax_mode === 'inter' ? 'IGST (Inter)' : 'CGST/SGST (Intra)'} ➔ ${newMeta.tax_mode === 'inter' ? 'IGST (Inter)' : 'CGST/SGST (Intra)'}`);
  }

  if (oldDoc.document_type !== newDoc.document_type) {
    changes.push(`Document Type: ${oldDoc.document_type} ➔ ${newDoc.document_type}`);
  }

  // 2. Receiver Details (Buyer / Client)
  const oldRec = (oldDoc.receiver_details || {}) as Partial<ExtractedInvoice['receiver_details']>;
  const newRec = (newDoc.receiver_details || {}) as Partial<ExtractedInvoice['receiver_details']>;

  if ((oldRec.name || '').trim() !== (newRec.name || '').trim()) {
    changes.push(`Buyer Name: "${oldRec.name || '-'}" ➔ "${newRec.name || '-'}"`);
  }

  if ((oldRec.gstin || '').trim() !== (newRec.gstin || '').trim()) {
    changes.push(`Buyer GSTIN: "${oldRec.gstin || '-'}" ➔ "${newRec.gstin || '-'}"`);
  }

  if ((oldRec.address || '').trim() !== (newRec.address || '').trim()) {
    changes.push(`Buyer Address modified`);
  }

  if ((oldRec.state || '') !== (newRec.state || '') || (oldRec.phone || '') !== (newRec.phone || '') || (oldRec.email || '') !== (newRec.email || '')) {
    changes.push(`Buyer Contact / State details modified`);
  }

  // 3. Issuer Details (Seller)
  const oldIss = (oldDoc.issuer_details || {}) as Partial<ExtractedInvoice['issuer_details']>;
  const newIss = (newDoc.issuer_details || {}) as Partial<ExtractedInvoice['issuer_details']>;

  if ((oldIss.name || '').trim() !== (newIss.name || '').trim()) {
    changes.push(`Seller Name: "${oldIss.name || '-'}" ➔ "${newIss.name || '-'}"`);
  }

  if ((oldIss.gstin || '').trim() !== (newIss.gstin || '').trim()) {
    changes.push(`Seller GSTIN: "${oldIss.gstin || '-'}" ➔ "${newIss.gstin || '-'}"`);
  }

  // 4. Shipped To Details
  const oldShip = (oldDoc.shipped_to_details || {}) as Partial<ExtractedInvoice['shipped_to_details']>;
  const newShip = (newDoc.shipped_to_details || {}) as Partial<ExtractedInvoice['shipped_to_details']>;
  if ((oldShip.name || '').trim() !== (newShip.name || '').trim() || (oldShip.address || '').trim() !== (newShip.address || '').trim() || (oldShip.gstin || '').trim() !== (newShip.gstin || '').trim()) {
    if (newShip.name || oldShip.name) {
      changes.push(`Shipping / Consignee: "${oldShip.name || '-'}" ➔ "${newShip.name || '-'}"`);
    }
  }

  // 5. Line Items Comparison
  const oldItems = oldDoc.items || [];
  const newItems = newDoc.items || [];

  if (oldItems.length !== newItems.length) {
    changes.push(`Line Items Count: ${oldItems.length} item(s) ➔ ${newItems.length} item(s)`);
  }

  const maxLen = Math.max(oldItems.length, newItems.length);
  for (let i = 0; i < maxLen; i++) {
    const oItem = oldItems[i];
    const nItem = newItems[i];

    if (!oItem && nItem) {
      changes.push(`Added Item #${i + 1}: "${nItem.description || 'Item'}" (Qty: ${nItem.quantity || 1} @ ₹${Number(nItem.unit_price || 0).toLocaleString('en-IN')})`);
    } else if (oItem && !nItem) {
      changes.push(`Removed Item #${i + 1}: "${oItem.description || 'Item'}" (Qty: ${oItem.quantity || 1})`);
    } else if (oItem && nItem) {
      const itemChanges: string[] = [];
      if ((oItem.description || '').trim() !== (nItem.description || '').trim()) {
        itemChanges.push(`Desc: "${oItem.description}" ➔ "${nItem.description}"`);
      }
      if (Number(oItem.quantity) !== Number(nItem.quantity)) {
        itemChanges.push(`Qty: ${oItem.quantity} ➔ ${nItem.quantity}`);
      }
      if (Number(oItem.unit_price) !== Number(nItem.unit_price)) {
        itemChanges.push(`Rate: ₹${Number(oItem.unit_price).toLocaleString('en-IN')} ➔ ₹${Number(nItem.unit_price).toLocaleString('en-IN')}`);
      }
      if ((oItem.hsn_sac || '').trim() !== (nItem.hsn_sac || '').trim()) {
        itemChanges.push(`HSN: "${oItem.hsn_sac || '-'}" ➔ "${nItem.hsn_sac || '-'}"`);
      }
      if (Number(oItem.discount || 0) !== Number(nItem.discount || 0)) {
        itemChanges.push(`Discount: ${oItem.discount || 0}% ➔ ${nItem.discount || 0}%`);
      }
      if (Number(oItem.cgst_rate || 0) !== Number(nItem.cgst_rate || 0) || Number(oItem.igst_rate || 0) !== Number(nItem.igst_rate || 0)) {
        itemChanges.push(`GST Rate modified`);
      }
      if (itemChanges.length > 0) {
        changes.push(`Item #${i + 1} (${nItem.description || oItem.description || 'Item'}): ${itemChanges.join(', ')}`);
      }
    }
  }

  // 6. Totals Changes
  const oldTot = (oldDoc.totals || {}) as Partial<ExtractedInvoice['totals']>;
  const newTot = (newDoc.totals || {}) as Partial<ExtractedInvoice['totals']>;

  const oldGrand = Number(oldTot.grand_total || 0);
  const newGrand = Number(newTot.grand_total || 0);
  if (Math.abs(oldGrand - newGrand) > 0.01) {
    changes.push(`Grand Total: ₹${oldGrand.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ➔ ₹${newGrand.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  }

  const oldSub = Number(oldTot.subtotal_taxable || 0);
  const newSub = Number(newTot.subtotal_taxable || 0);
  if (Math.abs(oldSub - newSub) > 0.01) {
    changes.push(`Taxable Subtotal: ₹${oldSub.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ➔ ₹${newSub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  }

  const oldTaxTotal = Number(oldTot.cgst_total || 0) + Number(oldTot.sgst_total || 0) + Number(oldTot.igst_total || 0);
  const newTaxTotal = Number(newTot.cgst_total || 0) + Number(newTot.sgst_total || 0) + Number(newTot.igst_total || 0);
  if (Math.abs(oldTaxTotal - newTaxTotal) > 0.01) {
    changes.push(`Total GST Tax: ₹${oldTaxTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ➔ ₹${newTaxTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  }

  // 7. Terms / Notes
  if (oldConfig && newConfig) {
    if ((oldConfig.terms || '').trim() !== (newConfig.terms || '').trim()) {
      changes.push(`Payment Terms modified`);
    }
    if ((oldConfig.headerText || '').trim() !== (newConfig.headerText || '').trim()) {
      changes.push(`Header Text modified`);
    }
    if ((oldConfig.footerText || '').trim() !== (newConfig.footerText || '').trim()) {
      changes.push(`Footer Text modified`);
    }
  }

  // 8. Generate concise summary
  let summary = "";
  if (changes.length === 0) {
    summary = "Document re-saved (no changes detected)";
  } else if (changes.length === 1) {
    summary = changes[0];
  } else {
    const highlights: string[] = [];
    if (Math.abs(oldGrand - newGrand) > 0.01) {
      highlights.push(`Grand Total (₹${oldGrand.toLocaleString('en-IN')} ➔ ₹${newGrand.toLocaleString('en-IN')})`);
    }
    if (oldItems.length !== newItems.length) {
      highlights.push(`Items (${oldItems.length} ➔ ${newItems.length})`);
    } else {
      const changedItemsCount = changes.filter(c => c.startsWith('Item #')).length;
      if (changedItemsCount > 0) {
        highlights.push(`${changedItemsCount} item(s) modified`);
      }
    }
    if ((oldMeta.invoice_date || '') !== (newMeta.invoice_date || '')) {
      highlights.push(`Date (${newMeta.invoice_date})`);
    }
    if ((oldRec.name || '').trim() !== (newRec.name || '').trim()) {
      highlights.push(`Buyer modified`);
    }

    if (highlights.length > 0) {
      summary = `${changes.length} change(s): ${highlights.join(', ')}`;
    } else {
      summary = `${changes.length} field(s) modified: ${changes.slice(0, 2).join('; ')}${changes.length > 2 ? '...' : ''}`;
    }
  }

  return { summary, changes };
};
