
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// Fields that exist in client TypeScript interfaces but NOT in Supabase table schemas.
// These must be stripped before upsert to avoid PGRST204 ("column not found") errors.
const CLIENT_ONLY_FIELDS: Record<string, string[]> = {
  finished_goods: ['isDTF'],
  received_goods: ['initialQuantity', 'lowStockThresholdPercent', 'isIgnoredForAlerts'],
};

// Whitelist of columns physically existing in the Supabase 'received_goods' table.
// Strips any client-only properties (such as invoiceDate, initialQuantity, lowStockThresholdPercent, etc.)
// to prevent PostgREST PGRST204 ("column not found in schema cache") errors.
const VALID_RECEIVED_GOODS_COLUMNS = new Set([
  'id', 'name', 'makeModel', 'supplier', 'quantity', 'status', 'damagedCount',
  'invoiceNumber', 'serials', 'timestamp', 'category', 'testReportLink',
  'gradingConfig', 'consumed_serials', 'notes', 'serialIndexMap',
  'min_threshold', 'safety_buffer_percent', 'is_ignored_for_alerts', 'uom',
  'initial_quantity'
]);

// Strip client-only fields before sending to Supabase
const sanitizeForUpload = (tableName: string, item: any): any => {
  if (tableName === 'received_goods') {
    const cleaned: Record<string, any> = { ...item };

    // Map client fields to database columns
    if (typeof item.initialQuantity === 'number') {
      cleaned.initial_quantity = item.initialQuantity;
    }
    if (typeof item.lowStockThresholdPercent === 'number') {
      cleaned.safety_buffer_percent = item.lowStockThresholdPercent;
    }
    if (typeof item.isIgnoredForAlerts === 'boolean') {
      cleaned.is_ignored_for_alerts = item.isIgnoredForAlerts;
    }
    if (typeof item.unitCost === 'number') {
      cleaned.serialIndexMap = {
        ...(typeof item.serialIndexMap === 'object' && item.serialIndexMap !== null ? item.serialIndexMap : {}),
        __unitCost: item.unitCost,
      };
      try {
        const costMap = JSON.parse(localStorage.getItem('dc_raw_material_manual_unit_costs_map') || '{}');
        costMap[item.id] = item.unitCost;
        if (item.name) {
          costMap['name:' + item.name.trim().toLowerCase()] = item.unitCost;
        }
        localStorage.setItem('dc_raw_material_manual_unit_costs_map', JSON.stringify(costMap));
      } catch (e) {}
    }

    // Retain only valid database columns to guarantee no PGRST204 errors
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(cleaned)) {
      if (VALID_RECEIVED_GOODS_COLUMNS.has(key)) {
        sanitized[key] = cleaned[key];
      }
    }
    return sanitized;
  }

  const fieldsToStrip = CLIENT_ONLY_FIELDS[tableName];
  if (!fieldsToStrip || fieldsToStrip.length === 0) return item;
  const cleaned = { ...item };
  for (const field of fieldsToStrip) {
    delete cleaned[field];
  }
  return cleaned;
};

// Re-derive client-only fields after loading from Supabase
const rehydrateFromDb = (tableName: string, items: any[]): any[] => {
  if (tableName === 'finished_goods') {
    return items.map(item => ({
      ...item,
      isDTF: typeof item.isDTF === 'boolean' ? item.isDTF : String(item.id || '').startsWith('fin-dtf-'),
    }));
  }
  if (tableName === 'received_goods') {
    let localIgnoredMap: Record<string, boolean> = {};
    let localInitialQtyMap: Record<string, number> = {};
    let localUnitCostMap: Record<string, number> = {};
    try {
      localIgnoredMap = JSON.parse(localStorage.getItem('dc_ignored_stock_alerts_map') || '{}');
      localInitialQtyMap = JSON.parse(localStorage.getItem('dc_initial_quantity_map') || '{}');
      localUnitCostMap = JSON.parse(localStorage.getItem('dc_raw_material_manual_unit_costs_map') || '{}');
    } catch (e) {
      localIgnoredMap = {};
      localInitialQtyMap = {};
      localUnitCostMap = {};
    }

    return items.map(item => {
      const currentQty = item.quantity || 0;
      let initialQty = typeof item.initialQuantity === 'number' && item.initialQuantity > 0
        ? item.initialQuantity
        : (typeof item.initial_quantity === 'number' && item.initial_quantity > 0
          ? item.initial_quantity
          : (item.id && localInitialQtyMap[item.id] > 0 ? localInitialQtyMap[item.id] : 0));

      if (!initialQty || initialQty <= 0) {
        initialQty = (item.serials && item.serials.length > 0 ? item.serials.length : currentQty) || 1;
        if (item.id && currentQty > 0) {
          localInitialQtyMap[item.id] = initialQty;
          try {
            localStorage.setItem('dc_initial_quantity_map', JSON.stringify(localInitialQtyMap));
          } catch (e) {}
        }
      }
      const lowStockThresholdPercent = typeof item.lowStockThresholdPercent === 'number'
        ? item.lowStockThresholdPercent
        : (typeof item.safety_buffer_percent === 'number'
          ? item.safety_buffer_percent
          : (typeof item.low_stock_threshold_percent === 'number' ? item.low_stock_threshold_percent : 20));

      const dbIgnoredVal = typeof item.isIgnoredForAlerts === 'boolean'
        ? item.isIgnoredForAlerts
        : (typeof item.is_ignored_for_alerts === 'boolean' ? item.is_ignored_for_alerts : undefined);

      const isIgnoredForAlerts = dbIgnoredVal !== undefined ? dbIgnoredVal : Boolean(localIgnoredMap[item.id]);
      const uom = item.uom || item.unit || 'qty';

      // Rehydrate unit cost from DB column (if migration run), serialIndexMap.__unitCost, or manual local map
      let unitCost = typeof item.unit_cost === 'number' && item.unit_cost > 0
        ? item.unit_cost
        : (typeof item.unitCost === 'number' && item.unitCost > 0 ? item.unitCost : undefined);
      if (unitCost === undefined && item.serialIndexMap && typeof item.serialIndexMap.__unitCost === 'number' && item.serialIndexMap.__unitCost > 0) {
        unitCost = item.serialIndexMap.__unitCost;
      }
      if (unitCost === undefined && item.id && localUnitCostMap[item.id] !== undefined) {
        unitCost = localUnitCostMap[item.id];
      }
      if (unitCost === undefined && item.name && localUnitCostMap['name:' + item.name.trim().toLowerCase()] !== undefined) {
        unitCost = localUnitCostMap['name:' + item.name.trim().toLowerCase()];
      }

      return {
        ...item,
        quantity: currentQty,
        initialQuantity: initialQty,
        lowStockThresholdPercent,
        isIgnoredForAlerts,
        uom,
        unitCost: unitCost ?? 0,
      };
    });
  }
  return items;
};

// ============================================================
// GLOBAL IN-MEMORY CACHE WITH TTL (5 MINUTES)
// Prevents duplicate DB queries during navigation or tab switching
// ============================================================
interface CacheEntry {
  data: any[];
  timestamp: number;
}
const MEMORY_CACHE: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes fresh data window

// Helper to check if cache is valid
const getValidCache = (tableName: string): any[] | null => {
  const entry = MEMORY_CACHE[tableName];
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
};

// Helper to update cache
const setCache = (tableName: string, data: any[]) => {
  MEMORY_CACHE[tableName] = {
    data,
    timestamp: Date.now(),
  };
};

// ============================================================
// GLOBAL FETCH QUEUE — Prevents connection pool exhaustion
// Supabase Free Plan allows ~15 concurrent Postgres connections.
// Semaphore limits concurrent fetches to MAX_CONCURRENT.
// ============================================================
const MAX_CONCURRENT_FETCHES = 3;
let activeFetches = 0;
const fetchQueue: Array<() => void> = [];

const acquireFetchSlot = (): Promise<void> => {
  return new Promise((resolve) => {
    if (activeFetches < MAX_CONCURRENT_FETCHES) {
      activeFetches++;
      resolve();
    } else {
      fetchQueue.push(() => {
        activeFetches++;
        resolve();
      });
    }
  });
};

const releaseFetchSlot = () => {
  activeFetches--;
  if (fetchQueue.length > 0 && activeFetches < MAX_CONCURRENT_FETCHES) {
    const next = fetchQueue.shift();
    if (next) next();
  }
};

// Tables that can grow very large — cap initial fetch to prevent unbounded pagination & memory bloat
const LARGE_TABLE_ROW_LIMIT: Record<string, number> = {
  logs: 300,
  supplies_records: 500,
};

// Field pruning for large table scans
const TABLE_SELECT_COLUMNS: Record<string, string> = {
  logs: 'id, action, details, timestamp, user',
  test_results: 'id, receivedGoodId, serialNumber, category, voltage, resistance, capacity, passed, grade, location, timestamp, testedBy',
  supplies_records: 'id, name, category, quantity, unit, timestamp, notes, supplier',
};

// Visibility re-fetch cooldown — prevents tab-switch storms
const VISIBILITY_COOLDOWN_MS = 300_000; // 5 minutes

export function useSupabase<T>(
  tableName: string,
  initialValue: T[],
  idKey: string = 'id',
  enabled: boolean = true
): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  // Initialize from cache if fresh, otherwise initialValue
  const [data, setData] = useState<T[]>(() => {
    const cached = getValidCache(tableName);
    return cached ? (cached as unknown as T[]) : initialValue;
  });

  const lastSyncedData = useRef<T[]>(data);
  const syncEnabled = useRef<boolean>(true);
  const initialFetchDone = useRef<boolean>(!!getValidCache(tableName));
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<T[]>(data);
  const lastFetchTimestamp = useRef<number>(getValidCache(tableName) ? Date.now() : 0);

  // Keep dataRef and global cache in sync with state
  useEffect(() => {
    dataRef.current = data;
    if (initialFetchDone.current) {
      setCache(tableName, data);
    }
  }, [data, tableName]);

  // Fetch initial data with concurrency queue & memory caching
  useEffect(() => {
    if (!enabled) return;

    const fetchAll = async (force: boolean = false) => {
      // Check cache first if not forcing
      if (!force) {
        const cached = getValidCache(tableName);
        if (cached) {
          setData(cached as unknown as T[]);
          lastSyncedData.current = cached as unknown as T[];
          dataRef.current = cached as unknown as T[];
          initialFetchDone.current = true;
          return;
        }
      }

      await acquireFetchSlot();

      try {
        const PAGE_SIZE = 500;
        const maxRows = LARGE_TABLE_ROW_LIMIT[tableName];
        let allData: any[] = [];
        let page = 0;
        let hasMore = true;

        while (hasMore) {
          const selectCols = TABLE_SELECT_COLUMNS[tableName] || '*';
          let query = supabase.from(tableName).select(selectCols);

          if (tableName === 'test_results' || tableName === 'logs' || tableName === 'received_goods' || tableName === 'finished_goods') {
            query = query.order('timestamp', { ascending: false }).order(idKey, { ascending: true });
          }

          const from = page * PAGE_SIZE;
          const to = from + PAGE_SIZE - 1;
          const { data: dbData, error } = await query.range(from, to);

          if (error) {
            if (error.code === 'PGRST205' || error.code === '42P01') {
              console.warn(`Supabase table '${tableName}' not found. Disabling sync. Using local data.`);
              syncEnabled.current = false;
              hasMore = false;
            } else {
              throw error;
            }
          } else if (dbData) {
            allData = allData.concat(dbData);
            if (dbData.length < PAGE_SIZE) {
              hasMore = false;
            } else {
              page++;
            }

            if (maxRows && allData.length >= maxRows) {
              allData = allData.slice(0, maxRows);
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }

        if (allData.length > 0) {
          const seen = new Set<string>();
          allData = allData.filter((item: any) => {
            const id = String(item[idKey]);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
          const hydrated = rehydrateFromDb(tableName, allData) as unknown as T[];
          setData(hydrated);
          lastSyncedData.current = hydrated;
          dataRef.current = hydrated;
          setCache(tableName, hydrated);
        }
        initialFetchDone.current = true;
        lastFetchTimestamp.current = Date.now();
      } catch (error: any) {
        console.warn(`[Offline/Cache Fallback] Could not sync '${tableName}' with Supabase. Using current data.`);
        syncEnabled.current = false;
        initialFetchDone.current = true;
      } finally {
        releaseFetchSlot();
      }
    };

    fetchAll();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && initialFetchDone.current && syncEnabled.current) {
        const elapsed = Date.now() - lastFetchTimestamp.current;
        if (elapsed >= VISIBILITY_COOLDOWN_MS) {
          fetchAll(true); // Soft refresh after 60s
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [tableName, idKey, enabled]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
      }
    };
  }, []);

  const syncToSupabase = async (newData: T[], oldData: T[]) => {
    if (!syncEnabled.current) return;

    const oldMap = new Map(oldData.map((item: any) => [String(item[idKey]), item]));
    const newIds = new Set(newData.map((item: any) => String(item[idKey])));

    const toUpsert = newData.filter((item: any) => {
      const id = String(item[idKey]);
      const oldItem = oldMap.get(id);
      return !oldItem || JSON.stringify(item) !== JSON.stringify(oldItem);
    });

    const toDeleteIds = oldData
      .filter((item: any) => !newIds.has(String(item[idKey])))
      .map((item: any) => String(item[idKey]));

    const CHUNK_SIZE = 100;

    const chunkArray = (arr: any[], size: number) => {
      return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size)
      );
    };

    try {
      if (toDeleteIds.length > 0) {
        const chunks = chunkArray(toDeleteIds, CHUNK_SIZE);
        for (const chunk of chunks) {
          const { error } = await supabase.from(tableName).delete().in(idKey, chunk);
          if (error) {
            console.error(`Error deleting chunk in ${tableName}:`, error);
          }
        }
      }
      if (toUpsert.length > 0) {
        const sanitized = toUpsert.map(item => sanitizeForUpload(tableName, item));
        const chunks = chunkArray(sanitized, CHUNK_SIZE);
        for (const chunk of chunks) {
          const { error } = await supabase.from(tableName).upsert(chunk);
          if (error) {
            console.error(`Error upserting chunk in ${tableName}:`, error);
          }
        }
      }
    } catch (error: any) {
      console.error(`Supabase sync error for ${tableName}:`, error.message || error);
    }
  };

  const flushSync = useCallback(() => {
    if (!syncEnabled.current || !initialFetchDone.current) return;

    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }

    const currentData = dataRef.current;
    const baseline = lastSyncedData.current;

    if (currentData !== baseline) {
      lastSyncedData.current = currentData;
      setCache(tableName, currentData);
      syncToSupabase(currentData, baseline);
    }
  }, [tableName, idKey]);

  const scheduleDebouncedSync = useCallback(() => {
    if (!syncEnabled.current || !initialFetchDone.current) return;

    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
    }

    syncTimer.current = setTimeout(() => {
      flushSync();
    }, 250); // 250ms responsive sync (down from 1500ms delay)
  }, [flushSync]);

  // Flush pending sync immediately on page unload / reload
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushSync();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
      }
    };
  }, [flushSync]);

  const setSupabaseData = useCallback((action: React.SetStateAction<T[]>) => {
    setData(prev => {
      const newData = typeof action === 'function' ? (action as any)(prev) : action;
      return newData;
    });
    scheduleDebouncedSync();
  }, [scheduleDebouncedSync]);

  return [data, setSupabaseData];
}
