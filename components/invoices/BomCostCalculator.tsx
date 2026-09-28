import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import type { Recipe, RecipeComponent, PriceListItem, ReceivedGood, User } from '../../types';

interface BomCostCalculatorProps {
  currentUser?: User | null;
  recipes: Recipe[];
  setRecipes?: React.Dispatch<React.SetStateAction<Recipe[]>>;
  priceList: PriceListItem[];
  setPriceList?: React.Dispatch<React.SetStateAction<PriceListItem[]>>;
  receivedGoods?: ReceivedGood[];
  addLogEntry?: (action: string, details: string) => void;
  onSwitchToPriceList?: () => void;
}

interface ComponentRow {
  id: string;
  name: string;
  qty: number;
  uom: string;
  unitCost: number; // Excl GST
  suggestedCost?: number;
}

export const BomCostCalculator: React.FC<BomCostCalculatorProps> = ({
  currentUser,
  recipes = [],
  setRecipes,
  priceList = [],
  setPriceList,
  receivedGoods = [],
  addLogEntry,
  onSwitchToPriceList,
}) => {
  if (currentUser && currentUser.role !== 'admin') {
    return (
      <div className="text-center p-8 bg-white rounded-xl shadow-xs border border-rose-200 text-rose-600 font-bold m-4">
        🔒 Access Denied: Director Admins Only (BOM Cost Calculator is restricted).
      </div>
    );
  }

  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [skuName, setSkuName] = useState<string>('Custom Battery Pack');
  const [hsnCode, setHsnCode] = useState<string>('85076000');
  
  // Component rows in spreadsheet - initialized fresh with 0 cost
  const [rows, setRows] = useState<ComponentRow[]>([
    { id: 'row-1', name: '', qty: 1, uom: 'pcs', unitCost: 0 },
  ]);

  // Overheads - start fresh at 0
  const [laborCost, setLaborCost] = useState<number>(0);
  const [packagingCost, setPackagingCost] = useState<number>(0);

  // Margins
  const [customMarginPercent, setCustomMarginPercent] = useState<number>(20);
  const [dealerMarginPercent, setDealerMarginPercent] = useState<number>(30); // 1.3x
  const [retailMarginPercent, setRetailMarginPercent] = useState<number>(50); // 1.5x
  const [gstRate, setGstRate] = useState<number>(18);

  // Status & feedback
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<string | null>(null); // 'dealer' | 'retail' | 'custom'

  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    setStatusMessage({ text, type });
    messageTimeoutRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  // Helper to find latest purchase cost for a component name from receivedGoods manual unit costs
  const findSuggestedCost = (name: string, receivedGoodId?: string): number | undefined => {
    if (!name?.trim() && !receivedGoodId) return undefined;
    const cleanName = (name || '').toLowerCase().trim();

    // 1. Check local manual storage cache map
    try {
      const localCostMap = JSON.parse(localStorage.getItem('dc_raw_material_manual_unit_costs_map') || '{}');
      if (receivedGoodId && typeof localCostMap[receivedGoodId] === 'number' && localCostMap[receivedGoodId] > 0) {
        return localCostMap[receivedGoodId];
      }
      if (cleanName && typeof localCostMap['name:' + cleanName] === 'number' && localCostMap['name:' + cleanName] > 0) {
        return localCostMap['name:' + cleanName];
      }
    } catch (e) {}

    // 2. Check receivedGoods matching id, exact name, or partial name
    const goods = receivedGoods || [];
    if (receivedGoodId) {
      const g = goods.find(item => item.id === receivedGoodId);
      if (g && typeof g.unitCost === 'number' && g.unitCost > 0) return g.unitCost;
      if (g && g.serialIndexMap && typeof g.serialIndexMap.__unitCost === 'number' && g.serialIndexMap.__unitCost > 0) {
        return g.serialIndexMap.__unitCost;
      }
    }

    // Exact name match
    const exactMatch = goods.find(g => (g.name || '').trim().toLowerCase() === cleanName && typeof g.unitCost === 'number' && g.unitCost > 0);
    if (exactMatch) return exactMatch.unitCost;

    // Check serialIndexMap.__unitCost on exact match
    const exactSerialCost = goods.find(g => (g.name || '').trim().toLowerCase() === cleanName && g.serialIndexMap && typeof g.serialIndexMap.__unitCost === 'number' && g.serialIndexMap.__unitCost > 0);
    if (exactSerialCost) return exactSerialCost.serialIndexMap!.__unitCost;

    // Fuzzy / substring match
    const partialMatch = goods.find(g => {
      const gName = (g.name || '').toLowerCase();
      const hasCost = (typeof g.unitCost === 'number' && g.unitCost > 0) || (g.serialIndexMap && typeof g.serialIndexMap.__unitCost === 'number' && g.serialIndexMap.__unitCost > 0);
      return hasCost && (gName.includes(cleanName) || cleanName.includes(gName) || (g.makeModel && cleanName.includes(g.makeModel.toLowerCase())));
    });
    if (partialMatch) {
      return (typeof partialMatch.unitCost === 'number' && partialMatch.unitCost > 0) 
        ? partialMatch.unitCost 
        : partialMatch.serialIndexMap?.__unitCost;
    }

    return undefined;
  };

  // Sync all BOM component costs with current raw materials inventory
  const handleSyncAllFromRawMaterials = () => {
    let updatedCount = 0;
    setRows(prev => prev.map(r => {
      const suggested = findSuggestedCost(r.name);
      if (suggested !== undefined && suggested > 0) {
        updatedCount++;
        return {
          ...r,
          unitCost: suggested,
          suggestedCost: suggested
        };
      }
      return r;
    }));

    if (updatedCount > 0) {
      showToast(`🔄 Synced ${updatedCount} component cost(s) from Raw Materials!`, 'success');
    } else {
      showToast('No matching raw material unit costs found in inventory.', 'info');
    }
  };

  // When a Recipe is selected from dropdown, load its components into the spreadsheet
  const handleSelectRecipe = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    if (!recipeId) return;

    const r = recipes.find(x => x.id === recipeId);
    if (!r) return;

    setSkuName(r.name);
    if (r.overheadCost !== undefined) setLaborCost(r.overheadCost);
    if (r.packagingCost !== undefined) setPackagingCost(r.packagingCost);
    if (r.customMarginPercent !== undefined) setCustomMarginPercent(r.customMarginPercent);
    if (r.dealerMarginPercent !== undefined) setDealerMarginPercent(r.dealerMarginPercent);
    if (r.retailMarginPercent !== undefined) setRetailMarginPercent(r.retailMarginPercent);
    if (r.gstRate !== undefined) setGstRate(r.gstRate);

    // Look for matching model in price list for HSN code
    const priceMatch = priceList.find(p => p.model_name.toLowerCase() === r.name.toLowerCase());
    if (priceMatch && priceMatch.hsn_code) {
      setHsnCode(priceMatch.hsn_code);
    }

    if (r.components && r.components.length > 0) {
      const newRows: ComponentRow[] = r.components.map((comp, idx) => {
        let name = comp.masterItemName || '';
        if (!name && comp.receivedGoodId) {
          const g = (receivedGoods || []).find(item => item.id === comp.receivedGoodId);
          name = g ? g.name : `Component ${idx + 1}`;
        }
        const suggested = findSuggestedCost(name, comp.receivedGoodId);
        // If comp.unitCost is 0 or undefined, automatically default to raw material purchase cost
        const initialCost = (comp.unitCost !== undefined && comp.unitCost > 0) ? comp.unitCost : (suggested || 0);

        return {
          id: `comp-${idx}-${Date.now()}`,
          name: name || `Component ${idx + 1}`,
          qty: comp.quantityPerUnit || 1,
          uom: comp.uom || 'pcs',
          unitCost: initialCost,
          suggestedCost: suggested,
        };
      });
      setRows(newRows);
      showToast(`Loaded BOM components for SKU "${r.name}"`, 'info');
    }
  };

  // Cell Update handlers
  const updateRow = (id: string, field: keyof ComponentRow, value: any) => {
    setRows(prev => prev.map(r => {
      if (r.id === id) {
        return { ...r, [field]: value };
      }
      return r;
    }));
  };

  const handleAddRow = () => {
    const newId = `row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    setRows(prev => [...prev, { id: newId, name: '', qty: 1, uom: 'pcs', unitCost: 0 }]);
  };

  const handleDeleteRow = (id: string) => {
    if (rows.length <= 1) {
      setRows([{ id: `row-${Date.now()}`, name: '', qty: 1, uom: 'pcs', unitCost: 0 }]);
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleClearAll = () => {
    if (confirm('Clear all rows and reset spreadsheet?')) {
      setSelectedRecipeId('');
      setSkuName('New SKU BOM');
      setRows([{ id: `row-${Date.now()}`, name: '', qty: 1, uom: 'pcs', unitCost: 0 }]);
      setLaborCost(0);
      setPackagingCost(0);
    }
  };

  // Mathematical Calculations
  const rawMaterialTotal = useMemo(() => {
    return rows.reduce((acc, row) => acc + (Number(row.qty || 0) * Number(row.unitCost || 0)), 0);
  }, [rows]);

  const totalOverhead = useMemo(() => {
    return Number(laborCost || 0) + Number(packagingCost || 0);
  }, [laborCost, packagingCost]);

  const baseBomCost = useMemo(() => {
    return rawMaterialTotal + totalOverhead;
  }, [rawMaterialTotal, totalOverhead]);

  // Multi-tier price builder
  const calculateTier = (marginPct: number) => {
    const priceExclGst = baseBomCost * (1 + marginPct / 100);
    const profitExclGst = priceExclGst - baseBomCost;
    const gstAmount = priceExclGst * (gstRate / 100);
    const priceInclGst = priceExclGst + gstAmount;
    const multiplier = 1 + marginPct / 100;
    const grossMarginOnSales = priceExclGst > 0 ? (profitExclGst / priceExclGst) * 100 : 0;

    return {
      marginPct,
      multiplier,
      profitExclGst,
      priceExclGst,
      gstAmount,
      priceInclGst,
      grossMarginOnSales,
    };
  };

  const baseTier = useMemo(() => calculateTier(0), [baseBomCost, gstRate]);
  const customTier = useMemo(() => calculateTier(customMarginPercent), [baseBomCost, customMarginPercent, gstRate]);
  const dealerTier = useMemo(() => calculateTier(dealerMarginPercent), [baseBomCost, dealerMarginPercent, gstRate]);
  const retailTier = useMemo(() => calculateTier(retailMarginPercent), [baseBomCost, retailMarginPercent, gstRate]);

  // Action: Save component costs and parameters to Recipe in Supabase
  const handleSaveToRecipe = async () => {
    if (!skuName.trim()) {
      alert('Please enter an SKU Name.');
      return;
    }

    setIsSaving(true);
    try {
      const validComponents: RecipeComponent[] = rows
        .filter(r => r.name.trim() !== '')
        .map(r => ({
          masterItemName: r.name.trim(),
          quantityPerUnit: Number(r.qty) || 1,
          uom: r.uom || 'pcs',
          unitCost: Math.round(Number(r.unitCost || 0) * 100) / 100,
        }));

      if (validComponents.length === 0) {
        alert('Please enter at least one valid component with a name.');
        setIsSaving(false);
        return;
      }

      let targetId = selectedRecipeId;
      let isNew = false;

      if (!targetId) {
        // Look up if recipe name already exists
        const existing = recipes.find(r => r.name.toLowerCase() === skuName.trim().toLowerCase());
        if (existing) {
          targetId = existing.id;
        } else {
          targetId = `recipe-${Date.now()}`;
          isNew = true;
        }
      }

      const updatedRecipe: Recipe = {
        id: targetId,
        name: skuName.trim(),
        components: validComponents,
        overheadCost: Number(laborCost) || 0,
        packagingCost: Number(packagingCost) || 0,
        customMarginPercent: Number(customMarginPercent) || 20,
        dealerMarginPercent: Number(dealerMarginPercent) || 30,
        retailMarginPercent: Number(retailMarginPercent) || 50,
        gstRate: Number(gstRate) || 18,
      };

      // Persist in Supabase
      if (isNew) {
        const { error } = await supabase.from('recipes').insert([updatedRecipe]);
        if (error) throw error;
        if (setRecipes) setRecipes(prev => [...prev, updatedRecipe]);
      } else {
        const { error } = await supabase.from('recipes').update({
          name: updatedRecipe.name,
          components: updatedRecipe.components,
          overheadCost: updatedRecipe.overheadCost,
          packagingCost: updatedRecipe.packagingCost,
          customMarginPercent: updatedRecipe.customMarginPercent,
          dealerMarginPercent: updatedRecipe.dealerMarginPercent,
          retailMarginPercent: updatedRecipe.retailMarginPercent,
          gstRate: updatedRecipe.gstRate,
        }).eq('id', targetId);
        if (error) throw error;
        if (setRecipes) setRecipes(prev => prev.map(r => r.id === targetId ? updatedRecipe : r));
      }

      setSelectedRecipeId(targetId);
      if (addLogEntry) {
        addLogEntry('SAVE_BOM_COST', `Saved BOM cost calculation for SKU '${skuName}' (Base Cost: ₹${baseBomCost.toFixed(2)})`);
      }
      showToast(`✅ Saved BOM & component costs to SKU "${skuName}" successfully!`);
    } catch (err: any) {
      console.error('Error saving recipe costs:', err);
      showToast(`Failed to save SKU costs: ${err.message || err}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Action: Push calculated price (Dealer or Retail) directly to Price List
  const handlePushToPriceList = async (tierType: 'dealer' | 'retail' | 'custom') => {
    if (!skuName.trim()) {
      alert('Please specify an SKU Name before pushing to Price List.');
      return;
    }

    setIsPushing(tierType);
    try {
      let targetPriceExclGst = 0;
      let labelSuffix = '';

      if (tierType === 'dealer') {
        targetPriceExclGst = Math.round(dealerTier.priceExclGst * 100) / 100;
        labelSuffix = ' (Dealer)';
      } else if (tierType === 'retail') {
        targetPriceExclGst = Math.round(retailTier.priceExclGst * 100) / 100;
        labelSuffix = ' (Retail)';
      } else {
        targetPriceExclGst = Math.round(customTier.priceExclGst * 100) / 100;
        labelSuffix = ' (Custom)';
      }

      const modelEntryName = tierType === 'dealer' 
        ? `${skuName.trim()}` 
        : `${skuName.trim()}${labelSuffix}`;

      // Check if item exists in priceList
      const existing = priceList.find(p => p.model_name.toLowerCase() === modelEntryName.toLowerCase());

      if (existing) {
        const { error } = await supabase
          .from('price_list')
          .update({
            price_without_gst: targetPriceExclGst,
            hsn_code: hsnCode.trim() || existing.hsn_code || '85076000',
          })
          .eq('id', existing.id);

        if (error) throw error;
        if (setPriceList) {
          setPriceList(prev => prev.map(p => p.id === existing.id ? {
            ...p,
            price_without_gst: targetPriceExclGst,
            hsn_code: hsnCode.trim() || p.hsn_code,
          } : p));
        }
        showToast(`✅ Updated Price List entry "${modelEntryName}" with ₹${targetPriceExclGst.toLocaleString('en-IN')} (excl. GST)`);
      } else {
        const { data, error } = await supabase
          .from('price_list')
          .insert([{
            model_name: modelEntryName,
            hsn_code: hsnCode.trim() || '85076000',
            price_without_gst: targetPriceExclGst,
          }])
          .select();

        if (error) throw error;
        if (data && setPriceList) {
          setPriceList(prev => [...prev, ...(data as PriceListItem[])]);
        }
        showToast(`✅ Added new Price List entry "${modelEntryName}" with ₹${targetPriceExclGst.toLocaleString('en-IN')} (excl. GST)`);
      }

      if (addLogEntry) {
        addLogEntry('PUSH_PRICE_LIST', `Pushed ${tierType} price ₹${targetPriceExclGst} for '${modelEntryName}' to Price List`);
      }
    } catch (err: any) {
      console.error('Error pushing to price list:', err);
      showToast(`Failed to update Price List: ${err.message || err}`, 'error');
    } finally {
      setIsPushing(null);
    }
  };

  // Action: Copy as TSV (Tab Separated) for direct Excel / Google Sheets paste
  const handleCopyClipboard = () => {
    let tsv = `BOM Internal Cost Sheet - ${skuName} (HSN: ${hsnCode})\n`;
    tsv += `#\tComponent Name\tQty\tUOM\tUnit Cost (₹ Excl GST)\tExt Cost (₹ Excl GST)\tCost Share %\n`;
    rows.forEach((r, idx) => {
      const ext = Number(r.qty || 0) * Number(r.unitCost || 0);
      const share = rawMaterialTotal > 0 ? ((ext / rawMaterialTotal) * 100).toFixed(1) : '0';
      tsv += `${idx + 1}\t${r.name}\t${r.qty}\t${r.uom}\t${r.unitCost}\t${ext.toFixed(2)}\t${share}%\n`;
    });
    tsv += `\nRaw Materials Subtotal (Excl GST):\t₹${rawMaterialTotal.toFixed(2)}\n`;
    tsv += `Labor & Assembly Overheads (Excl GST):\t₹${Number(laborCost).toFixed(2)}\n`;
    tsv += `Packaging & Freight Overheads (Excl GST):\t₹${Number(packagingCost).toFixed(2)}\n`;
    tsv += `TOTAL BASE BOM COST (Excl GST):\t₹${baseBomCost.toFixed(2)}\n\n`;
    tsv += `Pricing Matrix\tMargin Multiplier\tPrice (Excl GST)\tGST (${gstRate}%)\tPrice (Incl GST)\n`;
    tsv += `Base Cost Baseline\t1.00x\t₹${baseTier.priceExclGst.toFixed(2)}\t₹${baseTier.gstAmount.toFixed(2)}\t₹${baseTier.priceInclGst.toFixed(2)}\n`;
    tsv += `Custom Tier (${customMarginPercent}%)\t${customTier.multiplier.toFixed(2)}x\t₹${customTier.priceExclGst.toFixed(2)}\t₹${customTier.gstAmount.toFixed(2)}\t₹${customTier.priceInclGst.toFixed(2)}\n`;
    tsv += `Dealer Tier (${dealerMarginPercent}%)\t${dealerTier.multiplier.toFixed(2)}x\t₹${dealerTier.priceExclGst.toFixed(2)}\t₹${dealerTier.gstAmount.toFixed(2)}\t₹${dealerTier.priceInclGst.toFixed(2)}\n`;
    tsv += `Retail Tier (${retailMarginPercent}%)\t${retailTier.multiplier.toFixed(2)}x\t₹${retailTier.priceExclGst.toFixed(2)}\t₹${retailTier.gstAmount.toFixed(2)}\t₹${retailTier.priceInclGst.toFixed(2)}\n`;

    navigator.clipboard.writeText(tsv).then(() => {
      showToast('📋 Copied BOM Sheet to clipboard in Excel format! Ready to paste (Ctrl+V) in Excel or Sheets.');
    }).catch(() => {
      alert('Clipboard copy failed. Please select and copy manually.');
    });
  };

  // Action: Export as CSV
  const handleExportCsv = () => {
    let csv = `Component Name,Qty,UOM,Unit Cost (Excl GST),Ext Cost (Excl GST),Cost Share %\n`;
    rows.forEach(r => {
      const ext = Number(r.qty || 0) * Number(r.unitCost || 0);
      const share = rawMaterialTotal > 0 ? ((ext / rawMaterialTotal) * 100).toFixed(1) : '0';
      csv += `"${r.name.replace(/"/g, '""')}",${r.qty},${r.uom},${r.unitCost},${ext.toFixed(2)},${share}%\n`;
    });
    csv += `"Raw Materials Subtotal",,,,${rawMaterialTotal.toFixed(2)},\n`;
    csv += `"Labor Overhead",,,,${Number(laborCost).toFixed(2)},\n`;
    csv += `"Packaging Overhead",,,,${Number(packagingCost).toFixed(2)},\n`;
    csv += `"TOTAL BASE BOM COST (Excl GST)",,,,${baseBomCost.toFixed(2)},\n\n`;
    csv += `Pricing Tier,Margin %,Multiplier,Price (Excl GST),GST (${gstRate}%),Price (Incl GST)\n`;
    csv += `Base BOM Cost,0%,1.00x,${baseTier.priceExclGst.toFixed(2)},${baseTier.gstAmount.toFixed(2)},${baseTier.priceInclGst.toFixed(2)}\n`;
    csv += `Custom Tier,${customMarginPercent}%,${customTier.multiplier.toFixed(2)}x,${customTier.priceExclGst.toFixed(2)},${customTier.gstAmount.toFixed(2)},${customTier.priceInclGst.toFixed(2)}\n`;
    csv += `Dealer Tier,${dealerMarginPercent}%,${dealerTier.multiplier.toFixed(2)}x,${dealerTier.priceExclGst.toFixed(2)},${dealerTier.gstAmount.toFixed(2)},${dealerTier.priceInclGst.toFixed(2)}\n`;
    csv += `Retail Tier,${retailMarginPercent}%,${retailTier.multiplier.toFixed(2)}x,${retailTier.priceExclGst.toFixed(2)},${retailTier.gstAmount.toFixed(2)},${retailTier.priceInclGst.toFixed(2)}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `BOM_Costing_${skuName.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
    link.click();
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-3 font-sans text-slate-800 animate-fade-in text-xs">
      {/* TOAST MESSAGE */}
      {statusMessage && (
        <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs font-semibold shadow-sm transition-all ${
          statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
          statusMessage.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
          'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            <span>{statusMessage.type === 'success' ? '✅' : statusMessage.type === 'error' ? '⚠️' : 'ℹ️'}</span>
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-700 font-bold px-1.5">×</button>
        </div>
      )}

      {/* TOP CONTROL STRIP (EXCEL TOOLBAR) */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-3 border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: SKU Selector & Name */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">
            <span className="text-amber-400 font-black text-[11px] uppercase tracking-wider">SKU:</span>
            <select
              value={selectedRecipeId}
              onChange={e => handleSelectRecipe(e.target.value)}
              className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer max-w-[180px] truncate"
            >
              <option value="" className="bg-slate-800 text-slate-300">-- Choose Recipe BOM --</option>
              {recipes.map(r => (
                <option key={r.id} value={r.id} className="bg-slate-800 text-white">{r.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
            <span className="text-slate-400 text-[11px] font-semibold">SKU Name:</span>
            <input
              type="text"
              value={skuName}
              onChange={e => setSkuName(e.target.value)}
              placeholder="e.g. 12.8V 100Ah LFP"
              className="bg-slate-800 border border-slate-700 text-white font-bold text-xs rounded-lg px-2.5 py-1 flex-1 outline-none focus:border-[#8EBF45]"
            />
          </div>

          <div className="flex items-center gap-1.5 w-28">
            <span className="text-slate-400 text-[11px] font-semibold">HSN:</span>
            <input
              type="text"
              value={hsnCode}
              onChange={e => setHsnCode(e.target.value)}
              placeholder="85076000"
              className="bg-slate-800 border border-slate-700 text-white font-mono text-xs rounded-lg px-2 py-1 w-full outline-none focus:border-[#8EBF45]"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">
            <span className="text-slate-400 text-[11px] font-semibold">GST %:</span>
            <select
              value={gstRate}
              onChange={e => setGstRate(Number(e.target.value))}
              className="bg-transparent text-amber-300 font-bold text-xs outline-none cursor-pointer"
            >
              <option value={0} className="bg-slate-800">0%</option>
              <option value={5} className="bg-slate-800">5%</option>
              <option value={12} className="bg-slate-800">12%</option>
              <option value={18} className="bg-slate-800">18% (Standard)</option>
              <option value={28} className="bg-slate-800">28%</option>
            </select>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button
            onClick={handleAddRow}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs rounded-lg border border-slate-700 transition flex items-center gap-1 shadow-2xs"
            title="Add a new component row"
          >
            <span>+</span> Row
          </button>

          <button
            onClick={handleSaveToRecipe}
            disabled={isSaving}
            className="px-3 py-1 bg-[#8EBF45] hover:bg-[#7cb037] text-slate-950 font-black text-xs rounded-lg transition flex items-center gap-1 shadow-sm disabled:opacity-50"
            title="Save component unit costs and margins to Recipe in database"
          >
            <span>💾</span> {isSaving ? 'Saving...' : 'Save Costs to SKU'}
          </button>

          <button
            onClick={handleCopyClipboard}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-lg border border-slate-700 transition flex items-center gap-1 shadow-2xs"
            title="Copy as spreadsheet table to paste into Excel or Google Sheets"
          >
            <span>📋</span> Copy
          </button>

          <button
            onClick={handleExportCsv}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold text-xs rounded-lg border border-slate-700 transition flex items-center gap-1 shadow-2xs"
            title="Download CSV file"
          >
            <span>📥</span> CSV
          </button>

          {onSwitchToPriceList && (
            <button
              onClick={onSwitchToPriceList}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-lg border border-slate-700 transition"
              title="Switch to Master Price List"
            >
              Catalog ↗
            </button>
          )}

          <button
            onClick={handleClearAll}
            className="px-2 py-1 bg-slate-800 hover:bg-rose-900/40 text-rose-400 font-medium text-xs rounded-lg border border-slate-700 transition"
            title="Reset sheet"
          >
            Reset
          </button>
        </div>
      </div>

      {/* SPREADSHEET CONTAINER: 2-COLUMN SPLIT OR COMPACT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        
        {/* LEFT / MAIN (Cols 1-8): EXCEL COMPONENT TABLE */}
        <div className="lg:col-span-8 bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden flex flex-col">
          {/* Table Formula Bar / Sub-header */}
          <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-600 font-mono">
            <div className="flex items-center gap-2">
              <span className="font-serif italic font-bold text-slate-400 text-xs">fx</span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-700 font-sans font-semibold">BOM Components (Cost excluding GST)</span>
              <span className="bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-sans text-[10px] font-bold">
                {rows.length} rows
              </span>
            </div>
            <div className="flex items-center gap-3 font-sans">
              <button
                type="button"
                onClick={handleSyncAllFromRawMaterials}
                className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-bold text-[10px] rounded transition flex items-center gap-1 shadow-2xs"
                title="Auto-fetch and sync latest unit purchase costs from Raw Material Inventory"
              >
                <span>🔄</span> Sync from Raw Materials
              </button>
              <span className="text-slate-500">Raw Subtotal:</span>
              <span className="font-mono font-bold text-slate-900 text-xs">
                ₹{rawMaterialTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Excel Grid Table */}
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-black tracking-wider sticky top-0 z-10 select-none shadow-2xs">
                <tr>
                  <th className="p-1.5 border border-slate-200 w-8 text-center bg-slate-100">#</th>
                  <th className="p-1.5 border border-slate-200">Component / Raw Material</th>
                  <th className="p-1.5 border border-slate-200 w-16 text-right">Qty</th>
                  <th className="p-1.5 border border-slate-200 w-14 text-center">UOM</th>
                  <th className="p-1.5 border border-slate-200 w-28 text-right bg-amber-50/70 text-amber-950 font-black">
                    Unit Cost (₹)
                  </th>
                  <th className="p-1.5 border border-slate-200 w-28 text-right bg-emerald-50/70 text-emerald-950 font-black">
                    Ext Cost (₹)
                  </th>
                  <th className="p-1.5 border border-slate-200 w-14 text-right">Share</th>
                  <th className="p-1.5 border border-slate-200 w-8 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-xs">
                {rows.map((row, idx) => {
                  const extCost = Number(row.qty || 0) * Number(row.unitCost || 0);
                  const sharePct = rawMaterialTotal > 0 ? (extCost / rawMaterialTotal) * 100 : 0;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Row # */}
                      <td className="p-1 border border-slate-200 text-center text-slate-400 select-none font-sans text-[11px] bg-slate-50/40">
                        {idx + 1}
                      </td>

                      {/* Component Name */}
                      <td className="p-1 border border-slate-200 font-sans">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={row.name}
                            onChange={e => updateRow(row.id, 'name', e.target.value)}
                            placeholder="Component name..."
                            className="w-full px-1.5 py-0.5 text-xs text-slate-900 font-medium bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-amber-400 rounded"
                          />
                          {row.suggestedCost && row.suggestedCost !== row.unitCost && (
                            <button
                              onClick={() => updateRow(row.id, 'unitCost', row.suggestedCost)}
                              className="text-[9px] bg-amber-100 hover:bg-amber-200 text-amber-800 px-1 py-0.5 rounded font-bold whitespace-nowrap"
                              title="Click to apply raw material manual unit cost"
                            >
                              ₹{row.suggestedCost}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Quantity per Pack */}
                      <td className="p-1 border border-slate-200 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.qty}
                          onChange={e => updateRow(row.id, 'qty', parseFloat(e.target.value) || 0)}
                          className="w-full px-1 py-0.5 text-right font-mono text-xs text-slate-800 bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-amber-400 rounded"
                        />
                      </td>

                      {/* UOM */}
                      <td className="p-1 border border-slate-200 text-center font-sans">
                        <input
                          type="text"
                          value={row.uom}
                          onChange={e => updateRow(row.id, 'uom', e.target.value)}
                          placeholder="pcs"
                          className="w-full px-1 py-0.5 text-center text-slate-600 text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-amber-400 rounded uppercase"
                        />
                      </td>

                      {/* Unit Cost (Excl. GST) - CORE INPUT */}
                      <td className="p-1 border border-slate-200 text-right bg-amber-50/30">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400 text-[10px]">₹</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.unitCost === 0 ? '' : row.unitCost}
                            onChange={e => updateRow(row.id, 'unitCost', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full px-1 py-0.5 text-right font-mono font-bold text-xs text-slate-900 bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-amber-500 rounded"
                          />
                        </div>
                      </td>

                      {/* Ext. Cost (Excl. GST) - FORMULA */}
                      <td className="p-1.5 border border-slate-200 text-right font-mono font-bold text-slate-900 bg-emerald-50/20 text-xs">
                        ₹{extCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Share % */}
                      <td className="p-1 border border-slate-200 text-right text-[10px] text-slate-500 font-sans">
                        {sharePct > 0 ? `${sharePct.toFixed(1)}%` : '0%'}
                      </td>

                      {/* Delete Action */}
                      <td className="p-1 border border-slate-200 text-center">
                        <button
                          onClick={() => handleDeleteRow(row.id)}
                          className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-slate-400 hover:text-rose-600 font-bold text-sm leading-none px-1 py-0.5 transition"
                          title="Remove component"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Quick Row Add Bar */}
          <div className="bg-slate-50 border-t border-slate-200 px-3 py-1.5 flex items-center justify-between">
            <button
              onClick={handleAddRow}
              className="text-xs font-bold text-[#658C3E] hover:text-[#527331] flex items-center gap-1"
            >
              <span>+ Add Component Row</span>
            </button>
            <div className="text-[11px] text-slate-500">
              Tip: Press Tab to navigate across cells
            </div>
          </div>

          {/* Overheads & Internal Base Cost Footnote Summary */}
          <div className="bg-slate-100/70 border-t border-slate-300 p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Labor & Assembly */}
            <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase">Labor & Assembly</div>
                <div className="text-[9px] text-slate-400">Welding, QA & testing (excl. GST)</div>
              </div>
              <div className="flex items-center gap-1 font-mono">
                <span className="text-slate-400 text-xs">₹</span>
                <input
                  type="number"
                  min="0"
                  value={laborCost === 0 ? '' : laborCost}
                  onChange={e => setLaborCost(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="w-20 p-1 text-right font-bold text-xs border border-slate-200 rounded outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Packaging & Consumables */}
            <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase">Pack & Consumables</div>
                <div className="text-[9px] text-slate-400">Box, tape, freight (excl. GST)</div>
              </div>
              <div className="flex items-center gap-1 font-mono">
                <span className="text-slate-400 text-xs">₹</span>
                <input
                  type="number"
                  min="0"
                  value={packagingCost === 0 ? '' : packagingCost}
                  onChange={e => setPackagingCost(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="w-20 p-1 text-right font-bold text-xs border border-slate-200 rounded outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Total Internal Cost Card */}
            <div className="bg-slate-900 text-white p-2 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Total Base BOM Cost</div>
                <div className="text-[9px] text-slate-400">Internal Cost (Excl. GST)</div>
              </div>
              <div className="text-right font-mono font-black text-sm text-emerald-400">
                ₹{baseBomCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT (Cols 9-12): PRICING & MARGIN MATRIX (VERY SMALL SPACE & EXCEL-LIKE) */}
        <div className="lg:col-span-4 bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-slate-800 text-white px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">📊</span>
              <span className="font-bold text-xs">Pricing & Margin Matrix</span>
            </div>
            <span className="text-[10px] font-bold text-amber-300 bg-slate-700/80 px-1.5 py-0.5 rounded">
              GST: {gstRate}%
            </span>
          </div>

          {/* Margin Inputs Strip */}
          <div className="p-2.5 bg-slate-50 border-b border-slate-200 grid grid-cols-3 gap-2">
            <div className="bg-white p-1.5 rounded-md border border-slate-200">
              <div className="text-[9px] font-bold text-slate-500 uppercase">Custom %</div>
              <div className="flex items-center gap-1 mt-0.5">
                <input
                  type="number"
                  min="0"
                  value={customMarginPercent}
                  onChange={e => setCustomMarginPercent(parseFloat(e.target.value) || 0)}
                  className="w-full text-right font-mono font-bold text-xs border-b border-slate-300 outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-400">%</span>
              </div>
              <div className="text-[9px] text-slate-400 mt-0.5">{customTier.multiplier.toFixed(2)}x</div>
            </div>

            <div className="bg-white p-1.5 rounded-md border border-amber-200 bg-amber-50/20">
              <div className="text-[9px] font-black text-amber-800 uppercase">Dealer %</div>
              <div className="flex items-center gap-1 mt-0.5">
                <input
                  type="number"
                  min="0"
                  value={dealerMarginPercent}
                  onChange={e => setDealerMarginPercent(parseFloat(e.target.value) || 0)}
                  className="w-full text-right font-mono font-bold text-xs border-b border-amber-400 outline-none focus:border-amber-600 bg-transparent text-amber-900"
                />
                <span className="text-[10px] text-amber-600 font-bold">%</span>
              </div>
              <div className="text-[9px] text-amber-700 font-bold mt-0.5">{dealerTier.multiplier.toFixed(2)}x (1.3x)</div>
            </div>

            <div className="bg-white p-1.5 rounded-md border border-emerald-200 bg-emerald-50/20">
              <div className="text-[9px] font-black text-emerald-800 uppercase">Retail %</div>
              <div className="flex items-center gap-1 mt-0.5">
                <input
                  type="number"
                  min="0"
                  value={retailMarginPercent}
                  onChange={e => setRetailMarginPercent(parseFloat(e.target.value) || 0)}
                  className="w-full text-right font-mono font-bold text-xs border-b border-emerald-400 outline-none focus:border-emerald-600 bg-transparent text-emerald-900"
                />
                <span className="text-[10px] text-emerald-600 font-bold">%</span>
              </div>
              <div className="text-[9px] text-emerald-700 font-bold mt-0.5">{retailTier.multiplier.toFixed(2)}x (1.5x)</div>
            </div>
          </div>

          {/* High Density Excel Pricing Matrix */}
          <div className="p-2 space-y-2.5">
            {/* TIER 1: BASE BOM COST */}
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold text-slate-600">Base Cost (Internal)</span>
                <span className="text-[10px] text-slate-400 font-mono">0% Margin (1.00x)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">Excl. GST</span>
                  <span className="font-bold text-slate-800">
                    ₹{baseTier.priceExclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-400 block font-sans">Incl. GST ({gstRate}%)</span>
                  <span className="font-bold text-slate-600">
                    ₹{baseTier.priceInclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* TIER 2: CUSTOM MARGIN */}
            <div className="p-2 rounded-lg bg-blue-50/40 border border-blue-200">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold text-blue-900">Custom Margin ({customMarginPercent}%)</span>
                <button
                  onClick={() => handlePushToPriceList('custom')}
                  disabled={isPushing === 'custom'}
                  className="text-[9px] bg-blue-100 hover:bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded font-bold transition disabled:opacity-50"
                  title="Push this price to Master Price List"
                >
                  {isPushing === 'custom' ? 'Pushing...' : 'Push to Price List ↗'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs font-mono">
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">Profit (Excl)</span>
                  <span className="font-semibold text-blue-700">
                    +₹{customTier.profitExclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">Excl. GST</span>
                  <span className="font-bold text-slate-900">
                    ₹{customTier.priceExclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-400 block font-sans">Incl. GST</span>
                  <span className="font-bold text-blue-900">
                    ₹{customTier.priceInclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* TIER 3: DEALER MARGIN (1.30x / 30%) */}
            <div className="p-2 rounded-lg bg-amber-50/60 border border-amber-300">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-amber-900">Dealer Price</span>
                  <span className="bg-amber-200 text-amber-900 px-1 py-0.2 rounded text-[9px] font-bold">
                    {dealerMarginPercent}% ({dealerTier.multiplier.toFixed(2)}x)
                  </span>
                </div>
                <button
                  onClick={() => handlePushToPriceList('dealer')}
                  disabled={isPushing === 'dealer'}
                  className="text-[9px] bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded font-black transition disabled:opacity-50 shadow-2xs"
                  title="Push Dealer Price into Master Price List for Invoice Maker"
                >
                  {isPushing === 'dealer' ? 'Pushing...' : '💾 Push to Price List'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs font-mono">
                <div>
                  <span className="text-[9px] text-slate-500 block font-sans">Profit (Excl)</span>
                  <span className="font-semibold text-amber-800">
                    +₹{dealerTier.profitExclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 block font-sans">Excl. GST</span>
                  <span className="font-black text-slate-900 text-sm">
                    ₹{dealerTier.priceExclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-500 block font-sans">Incl. GST ({gstRate}%)</span>
                  <span className="font-black text-amber-900 text-sm">
                    ₹{dealerTier.priceInclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[9px] text-amber-700 border-t border-amber-200/60 pt-1 font-sans">
                <span>GST: ₹{dealerTier.gstAmount.toFixed(2)}</span>
                <span>Gross Margin: {dealerTier.grossMarginOnSales.toFixed(1)}% on sales</span>
              </div>
            </div>

            {/* TIER 4: RETAIL MARGIN (1.50x / 50%) */}
            <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-300">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-emerald-900">Retail / MRP</span>
                  <span className="bg-emerald-200 text-emerald-900 px-1 py-0.2 rounded text-[9px] font-bold">
                    {retailMarginPercent}% ({retailTier.multiplier.toFixed(2)}x)
                  </span>
                </div>
                <button
                  onClick={() => handlePushToPriceList('retail')}
                  disabled={isPushing === 'retail'}
                  className="text-[9px] bg-emerald-700 hover:bg-emerald-800 text-white px-2 py-0.5 rounded font-black transition disabled:opacity-50 shadow-2xs"
                  title="Push Retail Price into Master Price List"
                >
                  {isPushing === 'retail' ? 'Pushing...' : '💾 Push to Price List'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs font-mono">
                <div>
                  <span className="text-[9px] text-slate-500 block font-sans">Profit (Excl)</span>
                  <span className="font-semibold text-emerald-800">
                    +₹{retailTier.profitExclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 block font-sans">Excl. GST</span>
                  <span className="font-black text-slate-900 text-sm">
                    ₹{retailTier.priceExclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-500 block font-sans">Incl. GST ({gstRate}%)</span>
                  <span className="font-black text-emerald-900 text-sm">
                    ₹{retailTier.priceInclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[9px] text-emerald-700 border-t border-emerald-200/60 pt-1 font-sans">
                <span>GST: ₹{retailTier.gstAmount.toFixed(2)}</span>
                <span>Gross Margin: {retailTier.grossMarginOnSales.toFixed(1)}% on sales</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BomCostCalculator;
