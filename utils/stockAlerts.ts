import type { ReceivedGood } from '../types';

export interface StockAlertInfo {
    id: string;
    name: string;
    category: string;
    makeModel?: string;
    supplier?: string;
    quantity: number;
    initialQuantity: number;
    thresholdPercent: number;
    thresholdQty: number;
    percentRemaining: number;
    isLowStock: boolean;
    isOutOfStock: boolean;
    isIgnored: boolean;
}

/**
 * Calculates stock level metrics and low-stock alert status for a single item.
 */
export const getItemStockAlertInfo = (
    good: ReceivedGood,
    overrideThresholdPercent?: number
): StockAlertInfo => {
    const currentQty = good.quantity || 0;
    const isIgnored = Boolean(good.isIgnoredForAlerts);

    let localInitialQtyMap: Record<string, number> = {};
    try {
      localInitialQtyMap = JSON.parse(localStorage.getItem('dc_initial_quantity_map') || '{}');
    } catch (e) {
      localInitialQtyMap = {};
    }

    // Fixed baseline: initialQuantity locked permanently when entry is saved for the very first time
    let initialQty = good.initialQuantity && good.initialQuantity > 0
        ? good.initialQuantity
        : (good.id && localInitialQtyMap[good.id] && localInitialQtyMap[good.id] > 0 ? localInitialQtyMap[good.id] : 0);

    if (!initialQty || initialQty <= 0) {
        initialQty = (good.serials && good.serials.length > 0 ? good.serials.length : Math.max(currentQty, 1));
        if (good.id && currentQty > 0) {
            localInitialQtyMap[good.id] = initialQty;
            try {
                localStorage.setItem('dc_initial_quantity_map', JSON.stringify(localInitialQtyMap));
            } catch (e) {}
        }
    }
    
    const thresholdPercent = typeof overrideThresholdPercent === 'number'
        ? overrideThresholdPercent
        : (typeof good.lowStockThresholdPercent === 'number' ? good.lowStockThresholdPercent : 20);

    const thresholdQty = Math.round((initialQty * thresholdPercent) / 100);
    const percentRemaining = Math.max(0, Math.round((currentQty / initialQty) * 100));

    // If item is ignored, disable low stock / out of stock alert triggers
    const isOutOfStock = !isIgnored && currentQty <= 0;
    const isLowStock = !isIgnored && (isOutOfStock || currentQty <= thresholdQty);

    return {
        id: good.id,
        name: good.name || 'Unnamed Good',
        category: good.category || 'General',
        makeModel: good.makeModel,
        supplier: good.supplier,
        quantity: currentQty,
        initialQuantity: initialQty,
        thresholdPercent,
        thresholdQty,
        percentRemaining,
        isLowStock,
        isOutOfStock,
        isIgnored,
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
