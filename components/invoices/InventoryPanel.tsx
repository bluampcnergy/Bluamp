import React, { useState, useEffect, useMemo } from 'react';
import { ExtractedInvoice, InvoiceItem } from '../../types';
import { Package, Trash2, CheckCircle, AlertCircle, RefreshCw, Plus, ArrowRight, Loader2 } from './Icons';
import { supabase } from '../../supabaseClient';
import { findSimilarStockItems, StockItemMatch, normalizeText } from '../../utils/textMatcher';

interface InventoryPanelProps {
  data: ExtractedInvoice;
  onUpdate: (items: InvoiceItem[]) => void;
  setView?: (view: any) => void;
  addLogEntry?: (action: string, details: string) => void;
}

const CATEGORIES = [
  'Cell',
  'BMS',
  'Bat-misc',
  'Nickel Strip',
  'Wire',
  'Connector',
  'Holder',
  'Epoxy Sheet',
  'Sleeve',
  'Tape',
  'Screw',
  'Cabinet',
  'Charger',
  'Tools & Consumables',
  'Logistics & Service',
  'Other'
];

interface StockItemRow {
  index: number;
  name: string;
  category: string;
  make_model: string;
  quantity: number;
  uom: string;
  status: string;
  includeInStock: boolean;
  isSynced: boolean;
  currentStock: number;
  projectedStock: number;
  original_item: InvoiceItem;
}

const InventoryPanel: React.FC<InventoryPanelProps> = ({ data, onUpdate, setView, addLogEntry }) => {
  const [items, setItems] = useState<StockItemRow[]>([]);
  const [stockSummaryMap, setStockSummaryMap] = useState<Record<string, { name: string; totalQty: number; uom?: string; makeModel?: string; category?: string }>>({});
  const [existingItemNames, setExistingItemNames] = useState<string[]>([]);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [isSyncingStock, setIsSyncingStock] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [copiedItemIdx, setCopiedItemIdx] = useState<number | null>(null);
  const suggestionsCache = React.useRef<Map<string, StockItemMatch[]>>(new Map());

  // Invalidate suggestion cache when stock map updates
  useEffect(() => {
    suggestionsCache.current.clear();
  }, [stockSummaryMap]);

  const getCachedSuggestions = (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed || trimmed.length < 2) return [];
    if (suggestionsCache.current.has(trimmed)) {
      return suggestionsCache.current.get(trimmed)!;
    }
    const res = findSimilarStockItems(trimmed, stockSummaryMap, 4, 25);
    suggestionsCache.current.set(trimmed, res);
    return res;
  };

  // Fetch full inventory from received_goods to compute live stock quantities
  const fetchStockData = async () => {
    setIsLoadingStock(true);
    try {
      const { data: rgData, error } = await supabase
        .from('received_goods')
        .select('name, category, makeModel, quantity, uom');

      if (!error && rgData) {
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
        setExistingItemNames(Array.from(namesSet).sort());
      }
    } catch (err) {
      console.error('[InventoryPanel] Error fetching stock data:', err);
    } finally {
      setIsLoadingStock(false);
    }
  };

  useEffect(() => {
    fetchStockData();
  }, []);

  const guessCategory = (item: InvoiceItem): string => {
    if (item.item_type && CATEGORIES.includes(item.item_type)) return item.item_type;
    const text = `${item.description || ''} ${item.item_type || ''}`.toLowerCase();
    if (text.includes('cell') || text.includes('32700') || text.includes('18650') || text.includes('lfp') || text.includes('nmc') || text.includes('battery')) return 'Cell';
    if (text.includes('bms') || text.includes('pcb') || text.includes('protection board') || text.includes('circuit')) return 'BMS';
    if (text.includes('nickel') || text.includes('strip')) return 'Nickel Strip';
    if (text.includes('wire') || text.includes('cable') || text.includes('awg')) return 'Wire';
    if (text.includes('connector') || text.includes('anderson') || text.includes('xt60') || text.includes('xt90')) return 'Connector';
    if (text.includes('holder') || text.includes('bracket') || text.includes('spacer')) return 'Holder';
    if (text.includes('epoxy') || text.includes('insulation sheet') || text.includes('fr4')) return 'Epoxy Sheet';
    if (text.includes('sleeve') || text.includes('shrink')) return 'Sleeve';
    if (text.includes('tape') || text.includes('kapton')) return 'Tape';
    if (text.includes('screw') || text.includes('nut') || text.includes('bolt')) return 'Screw';
    if (text.includes('cabinet') || text.includes('enclosure') || text.includes('box') || text.includes('case')) return 'Cabinet';
    if (text.includes('charger') || text.includes('adapter')) return 'Charger';
    if (text.includes('freight') || text.includes('transport') || text.includes('delivery') || text.includes('courier') || text.includes('handling') || text.includes('service')) return 'Logistics & Service';
    return 'Other';
  };

  // Map incoming invoice items with live stock metrics
  useEffect(() => {
    const mapped: StockItemRow[] = (data.items || []).map((item, idx) => {
      const itemName = (item.description || '').trim() || 'Item';
      const category = item.item_type || guessCategory(item);
      const isNonStock = category === 'Logistics & Service' || itemName.toLowerCase().includes('freight') || itemName.toLowerCase().includes('delivery');

      const stockMatch = stockSummaryMap[itemName.toLowerCase()];
      const currentStock = stockMatch ? stockMatch.totalQty : 0;
      const addingQty = Number(item.quantity) || 0;
      const projectedStock = currentStock + (isNonStock ? 0 : addingQty);

      return {
        index: idx,
        name: itemName,
        category,
        make_model: item.make_model || stockMatch?.makeModel || '',
        quantity: addingQty,
        uom: stockMatch?.uom || 'qty',
        status: item.status || 'ND',
        includeInStock: !isNonStock,
        isSynced: false,
        currentStock,
        projectedStock,
        original_item: item
      };
    });

    setItems(mapped);
  }, [data.items, stockSummaryMap]);

  const syncToParent = (updatedRows: StockItemRow[]) => {
    const updatedInvoiceItems: InvoiceItem[] = updatedRows.map(row => ({
      ...row.original_item,
      description: row.name,
      item_type: row.category,
      make_model: row.make_model,
      quantity: Number(row.quantity) || 0,
      status: row.status
    }));
    onUpdate(updatedInvoiceItems);
  };

  const handleRowChange = (index: number, field: keyof StockItemRow, value: any) => {
    setItems(prev => {
      const next = [...prev];
      const current = { ...next[index], [field]: value };

      if (field === 'name') {
        const stockMatch = stockSummaryMap[(value || '').toLowerCase().trim()];
        current.currentStock = stockMatch ? stockMatch.totalQty : 0;
        if (stockMatch?.category && !current.category) current.category = stockMatch.category;
        if (stockMatch?.makeModel && !current.make_model) current.make_model = stockMatch.makeModel;
      }

      current.projectedStock = (current.currentStock || 0) + (current.includeInStock ? (Number(current.quantity) || 0) : 0);
      next[index] = current;
      syncToParent(next);
      return next;
    });
  };

  // Apply suggested master stock name to the item row
  const handleApplySuggestedName = (index: number, match: StockItemMatch) => {
    setItems(prev => {
      const next = [...prev];
      const current = { ...next[index] };
      current.name = match.name;
      current.currentStock = match.currentStock;
      if (match.category) current.category = match.category;
      if (match.makeModel) current.make_model = match.makeModel;
      if (match.uom) current.uom = match.uom;
      current.projectedStock = (current.currentStock || 0) + (current.includeInStock ? (Number(current.quantity) || 0) : 0);
      next[index] = current;
      syncToParent(next);
      return next;
    });
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedItemIdx(idx);
    setTimeout(() => setCopiedItemIdx(null), 2500);
  };

  // Direct sync items to received_goods in Supabase
  const handleSyncToRawMaterials = async () => {
    const itemsToSync = items.filter(it => it.includeInStock && !it.isSynced && it.quantity > 0);
    if (itemsToSync.length === 0) {
      alert("No pending inventory items selected to sync. Check the 'Sync to Stock' toggle on line items.");
      return;
    }

    setIsSyncingStock(true);
    setSyncSuccessMsg(null);

    try {
      const supplierName = data.issuer_details?.name || 'Vendor';
      const invoiceNum = data.invoice_metadata?.invoice_number || `WA-${Date.now()}`;
      const now = Date.now();

      const payload = itemsToSync.map((it, idx) => {
        const itemId = `rg-${now}-${idx}-${Math.random().toString(36).substr(2, 5)}`;
        const qty = Number(it.quantity) || 0;
        const unitCost = Number(it.unit_price) || 0;
        return {
          id: itemId,
          name: it.name.trim(),
          category: it.category || 'Other',
          makeModel: it.make_model || '',
          supplier: supplierName,
          quantity: qty,
          initial_quantity: qty,
          uom: it.uom || 'qty',
          unitCost: unitCost,
          status: it.status || 'ND',
          damagedCount: 0,
          invoiceNumber: invoiceNum,
          serials: [],
          serialIndexMap: { __unitCost: unitCost },
          timestamp: now,
          notes: `Imported via Scan & Import (Invoice #${invoiceNum}) | cost: ₹${unitCost}`
        };
      });

      // Save initial quantity & unit costs to localStorage map for client-side rehydration
      try {
        const localInitialMap = JSON.parse(localStorage.getItem('dc_initial_quantity_map') || '{}');
        const localCostMap = JSON.parse(localStorage.getItem('dc_raw_material_unit_costs_map') || '{}');
        payload.forEach(p => {
          localInitialMap[p.id] = p.quantity;
          if (p.unitCost > 0) {
            localCostMap[p.id] = p.unitCost;
            localCostMap['name:' + p.name.trim().toLowerCase()] = p.unitCost;
          }
        });
        localStorage.setItem('dc_initial_quantity_map', JSON.stringify(localInitialMap));
        localStorage.setItem('dc_raw_material_unit_costs_map', JSON.stringify(localCostMap));
      } catch (e) {
        console.warn('Failed to save to local initial quantity map:', e);
      }

      const { error } = await supabase.from('received_goods').insert(payload);
      if (error) throw error;

      // Mark synced in local state
      const syncedNames = new Set(itemsToSync.map(i => i.index));
      setItems(prev => prev.map(item => syncedNames.has(item.index) ? { ...item, isSynced: true } : item));

      addLogEntry?.('Import Raw Materials', `Added ${itemsToSync.length} items (${itemsToSync.reduce((s, i) => s + i.quantity, 0)} units) from Invoice #${invoiceNum} to Raw Materials`);

      setSyncSuccessMsg(`✅ Successfully added ${itemsToSync.length} items directly into Raw Materials (received_goods)!`);
      fetchStockData(); // Refresh stock map
    } catch (err: any) {
      alert(`Failed to add items to stock: ${err.message}`);
    } finally {
      setIsSyncingStock(false);
    }
  };

  const totalStockUnitsAdding = items
    .filter(i => i.includeInStock && !i.isSynced)
    .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-[#658C3E]" />
              <span>Plant Stock & Master Inventory Mapping</span>
            </h3>
            {isLoadingStock && <Loader2 className="animate-spin text-slate-400" size={14} />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Deterministic fuzzy matching suggests existing master stock names to keep plant inventory uniform.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStockData}
            disabled={isLoadingStock}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold transition-all shadow-xs"
            title="Refresh Live Stock from Database"
          >
            <RefreshCw size={14} className={isLoadingStock ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleSyncToRawMaterials}
            disabled={isSyncingStock || totalStockUnitsAdding === 0}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all ${
              totalStockUnitsAdding > 0
                ? 'bg-gradient-to-r from-[#658C3E] to-[#8EBF45] text-slate-950 hover:opacity-95 cursor-pointer'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
          >
            {isSyncingStock ? (
              <>
                <Loader2 className="animate-spin" size={14} />
                <span>Syncing to Stock...</span>
              </>
            ) : (
              <>
                <Package size={14} />
                <span>Add {totalStockUnitsAdding} Units to Stock</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Notification Alert */}
      {syncSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center justify-between animate-fade-in shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
          <button onClick={() => setSyncSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800 text-xs">✕</button>
        </div>
      )}

      {/* Stock Cards / Items List */}
      <div className="space-y-4">
        {items.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-100 text-center text-slate-400 text-xs italic">
            No line items extracted from this invoice. Click "Add Item" in the Invoice Breakdown tab to add manually.
          </div>
        ) : (
          items.map((item, idx) => {
            const hasStock = item.currentStock > 0;
            const isExactMatch = Boolean(stockSummaryMap[item.name.toLowerCase().trim()]);
            const suggestions = getCachedSuggestions(item.name);
            // Filter out exact duplicate if already matched
            const nonExactSuggestions = suggestions.filter(s => normalizeText(s.name) !== normalizeText(item.name));

            return (
              <div
                key={idx}
                className={`bg-white rounded-2xl border p-5 shadow-sm transition-all ${
                  item.isSynced
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : item.includeInStock
                    ? 'border-slate-200 hover:border-[#8EBF45]'
                    : 'border-slate-100 opacity-75 bg-slate-50/50'
                }`}
              >
                {/* Card Header: Item Name, Copy Name Button, Status Badge */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 flex items-center gap-1.5 max-w-xl">
                        <input
                          list="master-names-list"
                          className="font-black text-sm text-slate-900 bg-transparent border-b border-dashed border-slate-300 hover:border-slate-500 focus:border-[#658C3E] outline-none w-full py-0.5"
                          value={item.name}
                          onChange={(e) => handleRowChange(idx, 'name', e.target.value)}
                          placeholder="Master Item SKU Name..."
                        />
                        <button
                          onClick={() => copyToClipboard(item.name, idx)}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded text-xs transition-colors shrink-0"
                          title="Copy Item Name"
                        >
                          {copiedItemIdx === idx ? '✓ Copied' : '📋'}
                        </button>
                      </div>
                    </div>

                    {/* Exact Master Match confirmation indicator */}
                    {isExactMatch && (
                      <div className="flex items-center gap-1.5 mt-1.5 ml-7 text-[11px] font-bold text-emerald-700">
                        <CheckCircle size={13} />
                        <span>Exact Master SKU Match in Plant Inventory</span>
                      </div>
                    )}
                  </div>

                  {/* Sync Status Badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.isSynced ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1 border border-emerald-200">
                        <CheckCircle size={12} />
                        <span>Added to Stock</span>
                      </span>
                    ) : item.includeInStock ? (
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border border-blue-200">
                        Ready for Stock Import
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">
                        Non-Stock / Expense Only
                      </span>
                    )}

                    <button
                      onClick={() => {
                        const updated = items.filter((_, i) => i !== idx);
                        setItems(updated);
                        syncToParent(updated);
                      }}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove Item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Non-AI Similar Stock Item Recommendations */}
                {nonExactSuggestions.length > 0 && (
                  <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl animate-fade-in">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black text-amber-900 flex items-center gap-1.5">
                        <span>🔍</span>
                        <span>Similar Items Existing in Stock ({nonExactSuggestions.length} found):</span>
                      </span>
                      <span className="text-[10px] text-amber-700 font-medium hidden sm:inline">
                        Click a pill to import with that exact master name
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {nonExactSuggestions.map((rec, rIdx) => (
                        <div
                          key={rIdx}
                          className="flex items-center gap-1 bg-white border border-amber-200 hover:border-amber-400 hover:shadow-xs rounded-lg p-1 text-xs transition-all"
                        >
                          <button
                            onClick={() => handleApplySuggestedName(idx, rec)}
                            className="flex items-center gap-1.5 px-2 py-1 text-left font-bold text-slate-800 hover:text-[#658C3E]"
                            title={`Apply "${rec.name}" (${rec.score}% match, ${rec.currentStock} in stock)`}
                          >
                            <span className="text-amber-700 font-mono text-[10px] font-black bg-amber-100 px-1 py-0.5 rounded">
                              {rec.score}% match
                            </span>
                            <span className="font-bold">{rec.name}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({rec.currentStock.toLocaleString('en-IN')} in stock)
                            </span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(rec.name, idx);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded text-xs transition-colors"
                            title="Copy Master Name"
                          >
                            📋
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stock Math & Quantity Indicator Widget */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  {/* Current In-Stock */}
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${
                      hasStock ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
                    }`}>
                      📦
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Plant Stock</p>
                      <p className="text-sm font-black text-slate-800 font-mono">
                        {hasStock ? `${item.currentStock.toLocaleString('en-IN')} ${item.uom}` : '0 (New Item)'}
                      </p>
                    </div>
                  </div>

                  {/* Quantity from this Invoice */}
                  <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-slate-200 md:pl-3 pt-2 md:pt-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-black">
                      ➕
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Adding from Invoice</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <input
                          type="number"
                          className="w-20 font-black text-sm text-blue-600 bg-white border border-slate-200 rounded px-1.5 py-0.5 outline-none font-mono"
                          value={item.quantity}
                          onChange={(e) => handleRowChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                        <span className="text-xs text-slate-500 font-medium">{item.uom}</span>
                      </div>
                    </div>
                  </div>

                  {/* Projected Stock after Import */}
                  <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-slate-200 md:pl-3 pt-2 md:pt-0">
                    <div className="w-8 h-8 rounded-lg bg-[#8EBF45]/20 text-[#658C3E] flex items-center justify-center text-xs font-black">
                      🚀
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Projected New Stock</p>
                      <p className="text-sm font-black text-[#658C3E] font-mono">
                        {item.includeInStock ? `${item.projectedStock.toLocaleString('en-IN')} ${item.uom}` : `${item.currentStock} (Unchanged)`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Form Controls: Category, Make/Model, Status, Stock Toggle */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Category</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#658C3E]"
                      value={item.category}
                      onChange={(e) => handleRowChange(idx, 'category', e.target.value)}
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Make / Model</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium text-slate-800 outline-none focus:border-[#658C3E]"
                      placeholder="Brand, Grade, Cell Spec..."
                      value={item.make_model}
                      onChange={(e) => handleRowChange(idx, 'make_model', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">QC / Warehouse Status</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#658C3E]"
                      value={item.status}
                      onChange={(e) => handleRowChange(idx, 'status', e.target.value)}
                    >
                      <option value="ND">Not Damaged (ND)</option>
                      <option value="PR">Partially Received (PR)</option>
                      <option value="D">Damaged (D)</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={item.includeInStock}
                        onChange={(e) => handleRowChange(idx, 'includeInStock', e.target.checked)}
                        className="rounded text-[#658C3E] focus:ring-[#658C3E]"
                      />
                      <span className="text-xs font-bold text-slate-700 select-none">
                        Sync to Stock
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Datalist for existing master item autocomplete */}
      <datalist id="master-names-list">
        {existingItemNames.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* Helper Footer Note */}
      <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl text-xs text-blue-900 flex items-start gap-3">
        <span className="text-lg">💡</span>
        <div className="space-y-1">
          <p className="font-bold">Master SKU Consistency Tip:</p>
          <p className="text-blue-700 leading-relaxed text-[11px]">
            Ensure item names match your standard plant BOM definitions (e.g. <code>32700 Cell</code> or <code>BMS 4S 100A</code>).
            Matching master names allows production batch recipes and assembly consumption to track stock automatically.
          </p>
        </div>
      </div>
    </div>
  );
};

export default InventoryPanel;
