import React, { useState, useEffect } from 'react';
import { ExtractedInvoice, InvoiceItem } from '../../types';
import { validateGSTIN, recalculateInvoiceTotals } from '../../utils/invoiceUtils';
import { Plus, Trash2, AlertTriangle, CheckCircle, FileText, Building } from './Icons';
import { supabase } from '../../supabaseClient';
import { findSimilarStockItems, normalizeText } from '../../utils/textMatcher';

interface InvoiceFormProps {
  data: ExtractedInvoice;
  onChange: (data: ExtractedInvoice) => void;
}

const InvoiceForm: React.FC<InvoiceFormProps> = ({ data, onChange }) => {
  const [masterItemNames, setMasterItemNames] = useState<string[]>([]);
  const [stockSummaryMap, setStockSummaryMap] = useState<Record<string, { name: string; totalQty: number; uom?: string; makeModel?: string; category?: string }>>({});
  const suggestionsCache = React.useRef<Map<string, any[]>>(new Map());

  // Invalidate suggestions cache when stockSummaryMap changes
  useEffect(() => {
    suggestionsCache.current.clear();
  }, [stockSummaryMap]);

  const getCachedSuggestions = (desc: string) => {
    const trimmed = (desc || '').trim();
    if (!trimmed || trimmed.length < 2) return [];
    if (suggestionsCache.current.has(trimmed)) {
      return suggestionsCache.current.get(trimmed)!;
    }
    const res = findSimilarStockItems(trimmed, stockSummaryMap, 2, 30);
    suggestionsCache.current.set(trimmed, res);
    return res;
  };

  useEffect(() => {
    const fetchMasterData = async () => {
      const { data: rgData } = await supabase.from('received_goods').select('name, category, makeModel, quantity, uom');
      if (rgData) {
        const map: Record<string, { name: string; totalQty: number; uom?: string; makeModel?: string; category?: string }> = {};
        const namesSet = new Set<string>();

        rgData.forEach((rg: any) => {
          const rawName = (rg.name || '').trim();
          if (!rawName) return;
          namesSet.add(rawName);
          const key = rawName.toLowerCase();
          const qty = Number(rg.quantity) || 0;

          if (!map[key]) {
            map[key] = {
              name: rawName,
              totalQty: qty,
              uom: rg.uom || 'qty',
              makeModel: rg.makeModel,
              category: rg.category
            };
          } else {
            map[key].totalQty += qty;
          }
        });

        setStockSummaryMap(map);
        setMasterItemNames(Array.from(namesSet).sort());
      }
    };
    fetchMasterData();
  }, []);

  const updateField = (section: keyof ExtractedInvoice, field: string, value: any) => {
    let updated: ExtractedInvoice;
    if (section === 'source_type' || section === 'document_type') {
      updated = {
        ...data,
        [section]: value
      };
    } else {
      updated = {
        ...data,
        [section]: {
          ...(data[section] as any),
          [field]: value
        }
      };
    }

    if (field === 'source_type' || section === 'source_type') {
      const currentMetadata = (updated.invoice_metadata || {}) as any;
      if (value === 'sales') {
        updated.invoice_metadata = { ...currentMetadata, input_tax_credit: 'not_applicable' };
      } else if (value === 'purchase' && currentMetadata.input_tax_credit === 'not_applicable') {
        updated.invoice_metadata = { ...currentMetadata, input_tax_credit: 'set_off' };
      }
    }

    onChange(updated);
  };

  const updateMetadata = (field: string, value: string) => {
    updateField('invoice_metadata', field, value);
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...(data.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    const item = newItems[index];

    // Compute effective tax rate
    const totalGstRate = Number(item.igst_rate || 0) > 0
      ? Number(item.igst_rate)
      : (Number(item.cgst_rate || 0) + Number(item.sgst_rate || 0));

    if (field === 'total_value') {
      const inputTotal = Math.max(0, parseFloat(value) || 0);
      const qty = Math.max(1, Number(item.quantity) || 1);
      
      const calculatedTaxable = totalGstRate > 0 ? (inputTotal / (1 + (totalGstRate / 100))) : inputTotal;
      const calculatedUnitPrice = Math.max(0, calculatedTaxable / qty);
      const roundedUnitPrice = Math.round(calculatedUnitPrice * 10000) / 10000;
      
      item.unit_price = roundedUnitPrice;
      item.taxable_value = Math.max(0, Number(item.quantity) * roundedUnitPrice);
      item.total_value = inputTotal;
    } else if (field === 'quantity' || field === 'unit_price') {
      // Auto-calculate Taxable Value
      item.taxable_value = Number(item.quantity || 0) * Number(item.unit_price || 0);
    }

    // Auto-calculate Taxes based on Taxable Value
    const taxable = item.taxable_value || 0;
    if (field === 'cgst_rate' || field === 'quantity' || field === 'unit_price' || field === 'total_value') {
      item.cgst_amount = (taxable * Number(item.cgst_rate || 0)) / 100;
    }
    if (field === 'sgst_rate' || field === 'quantity' || field === 'unit_price' || field === 'total_value') {
      item.sgst_amount = (taxable * Number(item.sgst_rate || 0)) / 100;
    }
    if (field === 'igst_rate' || field === 'quantity' || field === 'unit_price' || field === 'total_value') {
      item.igst_amount = (taxable * Number(item.igst_rate || 0)) / 100;
    }

    // Auto-calculate Total if not updating total directly
    if (field !== 'total_value') {
      item.total_value =
        taxable +
        (item.cgst_amount || 0) +
        (item.sgst_amount || 0) +
        (item.igst_amount || 0);
    }

    const updated = { ...data, items: newItems };
    const newTotals = recalculateInvoiceTotals(newItems);
    updated.totals = { ...updated.totals, ...newTotals, grand_total: newTotals.grand_total + (updated.totals?.round_off || 0) };

    onChange(updated);
  };

  const addItem = () => {
    const newItem: InvoiceItem = {
      description: 'New Item',
      item_type: '',
      make_model: '',
      hsn_sac: '',
      quantity: 1,
      unit_price: 0,
      taxable_value: 0,
      cgst_rate: 9,
      cgst_amount: 0,
      sgst_rate: 9,
      sgst_amount: 0,
      igst_rate: 0,
      igst_amount: 0,
      total_value: 0
    };
    const updated = { ...data, items: [...(data.items || []), newItem] };
    onChange(updated);
  };

  const removeItem = (index: number) => {
    const newItems = (data.items || []).filter((_, i) => i !== index);
    const updated = { ...data, items: newItems };
    const newTotals = recalculateInvoiceTotals(newItems);
    updated.totals = { ...updated.totals, ...newTotals, grand_total: newTotals.grand_total + (updated.totals?.round_off || 0) };
    onChange(updated);
  };

  const isIssuerGSTValid = validateGSTIN(data.issuer_details?.gstin);
  const isReceiverGSTValid = validateGSTIN(data.receiver_details?.gstin);

  return (
    <div className="space-y-6">
      {/* Invoice Key Metadata Card */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#658C3E]" />
          <span>Invoice & Document Metadata</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Doc Type</label>
            <select
              className="p-2 border rounded-xl text-xs font-bold border-slate-200 bg-white text-slate-800 outline-none focus:border-[#658C3E]"
              value={data.document_type || 'invoice'}
              onChange={(e) => updateField('document_type', 'document_type', e.target.value)}
            >
              <option value="invoice">Tax Invoice</option>
              <option value="delivery_challan">Delivery Challan</option>
              <option value="purchase_order">Purchase Order</option>
              <option value="receipt">Receipt</option>
              <option value="debit_note">Debit Note</option>
              <option value="credit_note">Credit Note</option>
              <option value="bill">Bill</option>
              <option value="other">Other</option>
            </select>
          </div>
          <InputField
            label="Invoice / Doc No."
            value={data.invoice_metadata?.invoice_number}
            onChange={(v) => updateMetadata('invoice_number', v)}
            placeholder="INV-001 or DCh/..."
          />
          <InputField
            label="Document Date"
            type="date"
            value={data.invoice_metadata?.invoice_date}
            onChange={(v) => updateMetadata('invoice_date', v)}
          />
          <InputField
            label="Payment Due Date"
            type="date"
            value={data.invoice_metadata?.due_date}
            onChange={(v) => updateMetadata('due_date', v)}
          />
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Direction / Type</label>
            <select
              className="p-2 border rounded-xl text-xs font-bold border-slate-200 bg-white text-slate-800 outline-none focus:border-[#658C3E]"
              value={data.source_type || 'purchase'}
              onChange={(e) => updateField('source_type', 'source_type', e.target.value)}
            >
              <option value="purchase">Purchase (Inward / Vendor)</option>
              <option value="sales">Sales (Outward / Issued)</option>
            </select>
          </div>
        </div>

        {data.source_type === 'purchase' && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <div className="text-xs">
              <span className="font-bold text-slate-700">Input Tax Credit (ITC): </span>
              <span className="text-slate-500">Determine if tax paid is claimable under GST returns.</span>
            </div>
            <select
              className="p-1.5 border rounded-lg text-xs font-bold border-slate-200 bg-slate-50 text-slate-800 outline-none"
              value={data.invoice_metadata?.input_tax_credit || 'set_off'}
              onChange={(e) => updateMetadata('input_tax_credit', e.target.value)}
            >
              <option value="set_off">Eligible ITC (Set Off)</option>
              <option value="non_set_off">Ineligible ITC (Non Set Off)</option>
            </select>
          </div>
        )}
      </div>

      {/* Supplier (Issuer) & Buyer (Receiver) Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        <PartyCard
          title="Supplier / Issuer"
          badge="Vendor"
          data={data.issuer_details || {}}
          isValidGST={isIssuerGSTValid}
          onChange={(field, val) => updateField('issuer_details', field, val)}
        />
        <PartyCard
          title="Buyer / Receiver"
          badge="Company"
          data={data.receiver_details || {}}
          isValidGST={isReceiverGSTValid}
          onChange={(field, val) => updateField('receiver_details', field, val)}
        />
      </div>

      {/* Line Items Tax & Pricing Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Line Items & Tax Breakdown</h3>
            <p className="text-[11px] text-slate-500">Edit quantities, unit rates, HSN codes, and tax rates</p>
          </div>
          <button
            onClick={addItem}
            className="text-xs bg-[#8EBF45] text-[#0D0D0D] hover:bg-[#658C3E] hover:text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider flex items-center gap-1 shadow-xs transition-all"
          >
            <Plus size={14} /> Add Item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-xs text-slate-600">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-8 min-w-[32px]">#</th>
                <th className="p-3 min-w-[220px]">Description</th>
                <th className="p-3 w-24 min-w-[90px]">HSN</th>
                <th className="p-3 w-20 min-w-[75px] text-right">Qty</th>
                <th className="p-3 w-28 min-w-[105px] text-right">Rate (₹)</th>
                <th className="p-3 w-28 min-w-[105px] text-right">Taxable</th>
                <th className="p-3 w-20 min-w-[70px] text-right">GST%</th>
                <th className="p-3 w-28 min-w-[100px] text-right">Tax (₹)</th>
                <th className="p-3 w-32 min-w-[120px] text-right">Total (₹)</th>
                <th className="p-3 w-10 min-w-[40px] text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.items || []).map((item, idx) => {
                const totalGstRate = Number(item.igst_rate || 0) > 0
                  ? Number(item.igst_rate)
                  : (Number(item.cgst_rate || 0) + Number(item.sgst_rate || 0));
                const totalTaxAmt = (Number(item.cgst_amount || 0) + Number(item.sgst_amount || 0) + Number(item.igst_amount || 0));

                return (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 text-[10px] text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <input
                          list="master-invoice-items"
                          className="w-full bg-transparent border-b border-transparent focus:border-[#658C3E] outline-none font-bold text-slate-800 placeholder-slate-300 py-0.5"
                          value={item.description || ''}
                          onChange={(e) => updateItem(idx, 'description', e.target.value)}
                          placeholder="Item Description"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (item.description) {
                              navigator.clipboard.writeText(item.description);
                            }
                          }}
                          className="text-[10px] text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 shrink-0"
                          title="Copy Item Description"
                        >
                          📋
                        </button>
                      </div>

                      {/* Non-AI Similar Master SKU Suggestions */}
                      {(() => {
                        const suggestions = getCachedSuggestions(item.description || '');
                        const nonExact = suggestions.filter(s => normalizeText(s.name) !== normalizeText(item.description || ''));
                        if (nonExact.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {nonExact.map((s, sIdx) => (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() => updateItem(idx, 'description', s.name)}
                                className="text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 rounded px-1.5 py-0.5 flex items-center gap-1 text-left"
                                title={`Apply master name "${s.name}" (${s.score}% match)`}
                              >
                                <span>💡 {s.name}</span>
                                <span className="text-amber-600 font-mono">({s.score}%)</span>
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-3">
                      <input
                        className="w-full bg-transparent border-b border-transparent focus:border-[#658C3E] outline-none text-slate-600 font-mono py-0.5"
                        value={item.hsn_sac || ''}
                        onChange={(e) => updateItem(idx, 'hsn_sac', e.target.value)}
                        placeholder="HSN"
                      />
                    </td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        step="any"
                        className="w-full text-right bg-transparent border-b border-transparent focus:border-[#658C3E] outline-none font-mono font-bold text-slate-800 py-0.5"
                        value={item.quantity !== undefined && item.quantity !== null ? item.quantity : 0}
                        onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        step="any"
                        className="w-full text-right bg-transparent border-b border-transparent focus:border-[#658C3E] outline-none font-mono text-slate-700 py-0.5"
                        value={item.unit_price !== undefined && item.unit_price !== null ? item.unit_price : 0}
                        onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-800">
                      ₹{(item.taxable_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        step="any"
                        className="w-14 text-right bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 outline-none font-mono text-slate-700"
                        value={totalGstRate || 0}
                        onChange={(e) => {
                          const rate = parseFloat(e.target.value) || 0;
                          updateItem(idx, 'cgst_rate', rate / 2);
                          updateItem(idx, 'sgst_rate', rate / 2);
                          updateItem(idx, 'igst_rate', 0);
                        }}
                      />
                    </td>
                    <td className="p-3 text-right font-mono text-slate-600">
                      ₹{totalTaxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right font-mono font-black text-slate-900">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-slate-400 font-normal text-xs">₹</span>
                        <input
                          type="number"
                          step="any"
                          className="w-full text-right bg-transparent border-b border-transparent focus:border-[#658C3E] outline-none font-mono font-black text-slate-900 py-0.5"
                          value={item.total_value !== undefined && item.total_value !== null ? item.total_value : ''}
                          onChange={(e) => updateItem(idx, 'total_value', e.target.value)}
                          placeholder="0.00"
                          title="Total amount (including GST) - edit to back-calculate unit rate"
                        />
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => removeItem(idx)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                        title="Delete Row"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Totals & Validation Card */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* GST & Confidence Validation */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle size={14} className="text-[#658C3E]" />
            <span>OCR & GST Verification</span>
          </h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Supplier GSTIN</span>
              {data.issuer_details?.gstin ? (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  isIssuerGSTValid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {isIssuerGSTValid ? '✓ Valid Format' : '⚠️ Invalid GSTIN'}
                </span>
              ) : (
                <span className="text-slate-400 italic">Not detected</span>
              )}
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Buyer GSTIN</span>
              {data.receiver_details?.gstin ? (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  isReceiverGSTValid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {isReceiverGSTValid ? '✓ Valid Format' : '⚠️ Invalid GSTIN'}
                </span>
              ) : (
                <span className="text-slate-400 italic">Not detected</span>
              )}
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500">AI Extraction Confidence</span>
              <span className={`font-mono font-bold ${
                (data.ocr_confidence_score || 0.95) >= 0.85 ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                {(((data.ocr_confidence_score || 0.95) * 100)).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Financial Totals Breakdown */}
        <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md space-y-2 text-xs">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
            Financial Ledger Breakdown
          </h4>
          <div className="flex justify-between text-slate-300 font-mono">
            <span>Subtotal Taxable:</span>
            <span>₹{(data.totals?.subtotal_taxable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-slate-300 font-mono">
            <span>CGST Amount:</span>
            <span>₹{(data.totals?.cgst_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-slate-300 font-mono">
            <span>SGST Amount:</span>
            <span>₹{(data.totals?.sgst_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          {Number(data.totals?.igst_total || 0) > 0 && (
            <div className="flex justify-between text-slate-300 font-mono">
              <span>IGST Amount:</span>
              <span>₹{(data.totals?.igst_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="border-t border-slate-700 pt-2.5 mt-2 flex justify-between items-center text-base font-black text-[#8EBF45]">
            <span>Grand Total:</span>
            <span className="font-mono">₹{(data.totals?.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* Datalist for Master Item autocomplete */}
      <datalist id="master-invoice-items">
        {masterItemNames.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
};

const InputField = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = ''
}: {
  label: string;
  value: string | number | undefined;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
}) => (
  <div className="flex flex-col">
    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</label>
    <input
      type={type}
      className="p-2 border rounded-xl text-xs font-semibold border-slate-200 bg-white text-slate-900 outline-none focus:border-[#658C3E] focus:ring-1 focus:ring-[#658C3E] w-full"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

const PartyCard = ({
  title,
  badge,
  data,
  isValidGST,
  onChange
}: {
  title: string;
  badge: string;
  data: any;
  isValidGST: boolean;
  onChange: (f: string, v: string) => void;
}) => (
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-3">
    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
        <Building size={14} className="text-[#658C3E]" />
        <span>{title}</span>
      </h4>
      <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
        {badge}
      </span>
    </div>

    <InputField
      label="Legal Entity Name"
      value={data?.name}
      onChange={(v) => onChange('name', v)}
      placeholder="Company Name"
    />

    <div className="grid grid-cols-2 gap-2">
      <InputField
        label="GSTIN"
        value={data?.gstin}
        onChange={(v) => onChange('gstin', v)}
        placeholder="27AAAAA0000A1Z5"
      />
      <InputField
        label="State"
        value={data?.state}
        onChange={(v) => onChange('state', v)}
        placeholder="Maharashtra"
      />
    </div>

    <InputField
      label="Address"
      value={data?.address}
      onChange={(v) => onChange('address', v)}
      placeholder="Full Street Address"
    />
  </div>
);

export default InvoiceForm;
