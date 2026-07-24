# 📦 Low-Stock Notifications & Threshold Management System — Integration Guide

This guide provides the complete blueprint to replicate the **Low-Stock Notification & Threshold Management System** built for **Bluamp Energies**.

It features a clean separation of concerns:
- **Home Dashboard**: Clean, actionable **Stock Level Alerts & Notifications** feed.
- **Operations > Raw Materials**: Complete **Threshold Management** (0–100% range sliders, numeric inputs, low-stock visual badges, and dedicated filters).

---

## 1. Data Type Extensions (`types.ts`)

Extend your inventory/raw material interface to include `initialQuantity` (baseline) and `lowStockThresholdPercent` (percentage limit 0-100%).

```typescript
export interface ReceivedGood {
    id: string;
    name: string;
    category: string;
    makeModel?: string;
    supplier?: string;
    quantity: number;                     // Current physical quantity remaining
    initialQuantity?: number;              // Initial batch size / entry quantity
    lowStockThresholdPercent?: number;     // Configured safety limit percentage (0 - 100%, default: 20%)
    status?: ReceivedGoodStatus;
    damagedCount?: number;
    invoiceNumber?: string;
    serials: string[];
    serialIndexMap?: Record<string, number>;
    notes?: string;
    timestamp: number;
}
```

---

## 2. Stock Alert Calculation Utility (`utils/stockAlerts.ts`)

Create `utils/stockAlerts.ts` to compute current stock health, remaining percentages, and low-stock alert triggers dynamically.

```typescript
import type { ReceivedGood } from '../types';

export interface StockAlertInfo {
    id: string;
    name: string;
    category: string;
    makeModel?: string;
    quantity: number;
    initialQuantity: number;
    thresholdPercent: number;
    thresholdQty: number;
    percentRemaining: number;
    isLowStock: boolean;
    isOutOfStock: boolean;
}

/**
 * Calculates stock level metrics and low-stock alert status for a single item.
 */
export const getItemStockAlertInfo = (
    good: ReceivedGood,
    overrideThresholdPercent?: number
): StockAlertInfo => {
    const currentQty = good.quantity || 0;
    
    // Fallback baseline: initialQuantity, serials count, or current quantity
    const initialQty = good.initialQuantity && good.initialQuantity > 0
        ? good.initialQuantity
        : (good.serials && good.serials.length > 0 ? good.serials.length : Math.max(currentQty, 1));

    const thresholdPercent = typeof overrideThresholdPercent === 'number'
        ? overrideThresholdPercent
        : (typeof good.lowStockThresholdPercent === 'number' ? good.lowStockThresholdPercent : 20);

    const thresholdQty = Math.round((initialQty * thresholdPercent) / 100);
    const percentRemaining = Math.max(0, Math.round((currentQty / initialQty) * 100));

    const isOutOfStock = currentQty <= 0;
    const isLowStock = isOutOfStock || currentQty <= thresholdQty;

    return {
        id: good.id,
        name: good.name || 'Unnamed Good',
        category: good.category || 'General',
        makeModel: good.makeModel,
        quantity: currentQty,
        initialQuantity: initialQty,
        thresholdPercent,
        thresholdQty,
        percentRemaining,
        isLowStock,
        isOutOfStock,
    };
};

/**
 * Filters inventory items to return only those operating below safety threshold.
 */
export const getLowStockAlerts = (
    goods: ReceivedGood[],
    overrides: Record<string, number> = {}
): StockAlertInfo[] => {
    if (!goods || !Array.isArray(goods)) return [];

    return goods
        .map(good => getItemStockAlertInfo(good, overrides[good.id]))
        .filter(item => item.isLowStock)
        .sort((a, b) => a.percentRemaining - b.percentRemaining);
};
```

---

## 3. Database Persistence & Sanitization (`hooks/useSupabase.ts`)

If your database table does not yet have explicit `initial_quantity` or `low_stock_threshold_percent` columns, strip client-side metadata during DB writes and rehydrate defaults on load.

```typescript
const CLIENT_ONLY_FIELDS = ['serials', 'serialIndexMap', 'notes', 'initialQuantity', 'lowStockThresholdPercent'];

// Sanitizer for DB insert/update
function sanitizeForDb(good: Partial<ReceivedGood>) {
    const copy: any = { ...good };
    CLIENT_ONLY_FIELDS.forEach(field => delete copy[field]);
    return copy;
}

// Rehydration helper when pulling from Supabase
const rehydrateFromDb = (dbGood: any): ReceivedGood => {
    const currentQty = dbGood.quantity || 0;
    const initialQty = dbGood.initialQuantity || currentQty || 1;
    const lowStockThresholdPercent = typeof dbGood.lowStockThresholdPercent === 'number'
        ? dbGood.lowStockThresholdPercent
        : 20;

    return {
        ...dbGood,
        quantity: currentQty,
        initialQuantity: initialQty,
        lowStockThresholdPercent,
        serials: dbGood.serials || [],
        notes: dbGood.notes || 'actual physical qty = '
    };
};
```

---

## 4. Threshold Management in Operations (`components/ReceivedGoods.tsx`)

Managing safety limits happens in **Operations > Raw Materials** to prevent home dashboard clutter.

### A. Modal Form Threshold Inputs
Add the threshold range slider & percentage input to the item Add/Edit modal:

```tsx
<div className="col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
    <div className="flex justify-between items-center">
        <label className="block text-xs font-bold text-[#205f64] uppercase tracking-wider font-brand">
            Low Stock Alert Safety Threshold (0% - 100%)
        </label>
        <span className="text-xs font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
            {formData.lowStockThresholdPercent ?? 20}% of entry
        </span>
    </div>
    <div className="flex items-center gap-3">
        <input 
            type="range" 
            min="0" 
            max="100" 
            value={formData.lowStockThresholdPercent ?? 20} 
            onChange={e => setFormData({ ...formData, lowStockThresholdPercent: parseInt(e.target.value) || 0 })} 
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#205f64]"
        />
        <div className="flex items-center gap-1">
            <input 
                type="number" 
                min="0" 
                max="100" 
                value={formData.lowStockThresholdPercent ?? 20} 
                onChange={e => setFormData({ ...formData, lowStockThresholdPercent: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} 
                className="w-16 border border-slate-300 rounded-lg p-1.5 text-center text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            />
            <span className="text-xs font-bold text-slate-600">%</span>
        </div>
    </div>
    <p className="text-[11px] text-slate-500 font-medium">
        Triggers alert on Home Dashboard when stock drops below <strong>{Math.round(((formData.initialQuantity || formData.quantity || 0) * (formData.lowStockThresholdPercent ?? 20)) / 100)}</strong> units ({formData.lowStockThresholdPercent ?? 20}% of original entry quantity).
    </p>
</div>
```

### B. Raw Materials Card Badges & Filters
Include low-stock badges on item cards and a dedicated `⚠️ Low Stock Alerts` filter button:

```tsx
// Card Badge
{stockAlert.isLowStock && (
    <div className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border w-fit ${
        stockAlert.isOutOfStock ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
    }`}>
        {stockAlert.isOutOfStock ? '🚫 OUT OF STOCK' : `⚠️ LOW STOCK (${stockAlert.thresholdPercent}%)`}
    </div>
)}

// Filter Button
<button
    onClick={() => setFilterLowStock(!filterLowStock)}
    className={`px-4 py-1.5 text-xs font-bold rounded-full border transition-all flex items-center gap-1.5 ${filterLowStock ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
>
    ⚠️ Low Stock Alerts
</button>
```

---

## 5. Home Dashboard Notifications Feed (`components/HomeDashboard.tsx`)

The Home Dashboard renders a clean, actionable **Stock Level Alerts & Notifications** widget without sliders or setup controls:

```tsx
const lowStockAlerts = useMemo(() => {
    return getLowStockAlerts(receivedGoods);
}, [receivedGoods]);

return (
    <div className={`rounded-2xl p-5 shadow-sm border transition-all ${
        lowStockAlerts.length > 0
            ? 'bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-orange-500/10 border-amber-300/60'
            : 'bg-white border-[#2ca4c2]/20'
    }`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-200/60 pb-3 mb-4">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm ${
                    lowStockAlerts.length > 0 ? 'bg-amber-500 text-white animate-pulse' : 'bg-emerald-100 text-emerald-700'
                }`}>
                    {lowStockAlerts.length > 0 ? '⚠️' : '✅'}
                </div>
                <div>
                    <h3 className="text-xs font-black text-[#205f64] uppercase tracking-widest flex items-center gap-2 font-brand">
                        Stock Level Alerts & Notifications
                        {lowStockAlerts.length > 0 ? (
                            <span className="px-2 py-0.5 text-[10px] font-extrabold bg-amber-500 text-white rounded-full shadow-sm">
                                {lowStockAlerts.length} LOW STOCK
                            </span>
                        ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full">
                                All Stock Healthy
                            </span>
                        )}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                        {lowStockAlerts.length > 0
                            ? 'Real-time inventory alerts for raw materials below minimum safety thresholds.'
                            : 'All inventory items are currently above their configured safety thresholds.'}
                    </p>
                </div>
            </div>

            <button
                onClick={() => setView && setView('received')}
                className="px-3.5 py-1.5 bg-[#205f64] hover:bg-[#18484c] text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
            >
                <span>Manage Inventory & Thresholds ➔</span>
            </button>
        </div>

        {/* CARDS */}
        {lowStockAlerts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {lowStockAlerts.map(item => (
                    <div key={item.id} className="bg-white rounded-xl p-4 border border-amber-200 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                        {item.category}
                                    </span>
                                    <h4 className="text-sm font-bold text-slate-800 mt-1">{item.name}</h4>
                                    {item.makeModel && <p className="text-xs text-slate-500">{item.makeModel}</p>}
                                </div>
                                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md border ${
                                    item.isOutOfStock
                                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                                        : 'bg-amber-100 text-amber-900 border-amber-300'
                                }`}>
                                    {item.isOutOfStock ? '🚫 OUT OF STOCK' : '⚠️ LOW STOCK'}
                                </span>
                            </div>

                            <div className="my-3 space-y-1">
                                <div className="flex justify-between text-xs font-semibold">
                                    <span className="text-slate-600">Current Stock</span>
                                    <span className={item.isOutOfStock ? 'text-rose-600 font-extrabold' : 'text-amber-700 font-bold'}>
                                        {item.quantity} / {item.initialQuantity} units ({item.percentRemaining}%)
                                    </span>
                                </div>
                                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                            item.isOutOfStock
                                                ? 'bg-rose-600'
                                                : item.percentRemaining <= 10
                                                ? 'bg-rose-500 animate-pulse'
                                                : 'bg-amber-500'
                                        }`}
                                        style={{ width: `${Math.min(100, item.percentRemaining)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-2 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-medium">
                                Safety Trigger: <strong className="text-slate-800">{item.thresholdPercent}%</strong> ({item.thresholdQty} units)
                            </span>
                            <button
                                onClick={() => setView && setView('received')}
                                className="text-[#205f64] hover:text-[#18484c] font-bold text-xs flex items-center gap-1 transition-colors"
                            >
                                Adjust in Raw Materials ➔
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
                <span className="font-semibold">✨ All inventory stock levels are operating safely above minimum thresholds.</span>
                <button
                    onClick={() => setView && setView('received')}
                    className="font-bold text-[#205f64] hover:underline"
                >
                    Open Raw Materials Operations ➔
                </button>
            </div>
        )}
    </div>
);
```

---

## 6. Replication Summary Checklist

- [x] Extend `ReceivedGood` interface with `initialQuantity` & `lowStockThresholdPercent`.
- [x] Create `utils/stockAlerts.ts` for calculations.
- [x] Add threshold slider & percentage input to Add/Edit form in `ReceivedGoods.tsx`.
- [x] Add low-stock card badges & low-stock filter button in `ReceivedGoods.tsx`.
- [x] Render clean, non-cluttered Stock Level Alerts banner on `HomeDashboard.tsx` linking to Operations.
