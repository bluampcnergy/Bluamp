
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// Fields that exist in client TypeScript interfaces but NOT in Supabase table schemas.
// These must be stripped before upsert to avoid PGRST204 ("column not found") errors.
const CLIENT_ONLY_FIELDS: Record<string, string[]> = {
  finished_goods: ['isDTF'],
  received_goods: ['initialQuantity', 'lowStockThresholdPercent', 'isIgnoredForAlerts'],
};

// Strip client-only fields before sending to Supabase
const sanitizeForUpload = (tableName: string, item: any): any => {
  const fieldsToStrip = CLIENT_ONLY_FIELDS[tableName];
  if (!fieldsToStrip || fieldsToStrip.length === 0) return item;
  const cleaned = { ...item };

  if (tableName === 'received_goods') {
    if (typeof item.isIgnoredForAlerts === 'boolean') {
      cleaned.is_ignored_for_alerts = item.isIgnoredForAlerts;
    }
  }

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
    try {
      localIgnoredMap = JSON.parse(localStorage.getItem('dc_ignored_stock_alerts_map') || '{}');
    } catch (e) {
      localIgnoredMap = {};
    }

    return items.map(item => {
      const currentQty = item.quantity || 0;
      const initialQty = item.initialQuantity || (item.serials && item.serials.length > 0 ? item.serials.length : currentQty) || 1;
      const lowStockThresholdPercent = typeof item.lowStockThresholdPercent === 'number'
        ? item.lowStockThresholdPercent
        : (typeof item.low_stock_threshold_percent === 'number' ? item.low_stock_threshold_percent : 20);

      const dbIgnoredVal = typeof item.isIgnoredForAlerts === 'boolean'
        ? item.isIgnoredForAlerts
        : (typeof item.is_ignored_for_alerts === 'boolean' ? item.is_ignored_for_alerts : undefined);

      const isIgnoredForAlerts = dbIgnoredVal !== undefined ? dbIgnoredVal : Boolean(localIgnoredMap[item.id]);

      return {
        ...item,
        quantity: currentQty,
        initialQuantity: initialQty,
        lowStockThresholdPercent,
        isIgnoredForAlerts,
      };
    });
  }
  return items;
};

export function useSupabase<T>(
  tableName: string,
  initialValue: T[],
  idKey: string = 'id'
): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const [data, setData] = useState<T[]>(initialValue);
  // Track the data that is currently known to be in the DB (or scheduled to be)
  const lastSyncedData = useRef<T[]>(initialValue);
  // Ref to track if sync is allowed. We disable it if the table doesn't exist or network fails.
  const syncEnabled = useRef<boolean>(true);
  // Ref to track if initial fetch is complete — prevents syncing dummy/initial data
  const initialFetchDone = useRef<boolean>(false);
  // Debounce timer ref — ensures only ONE sync fires after all rapid mutations settle
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to always access the latest data without stale closures
  const dataRef = useRef<T[]>(initialValue);

  // Keep dataRef always in sync with the latest state
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Fetch initial data — PAGINATED to bypass Supabase max_rows limit (default 1000)
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const PAGE_SIZE = 1000;
        let allData: any[] = [];
        let page = 0;
        let hasMore = true;

        while (hasMore) {
          let query = supabase.from(tableName).select('*');

          // Stable sort: timestamp DESC + id ASC as tiebreaker
          // Without the secondary sort, same-timestamp rows have non-deterministic order
          // across pages, causing rows to be skipped or duplicated
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
            // If we got fewer rows than PAGE_SIZE, we've reached the end
            if (dbData.length < PAGE_SIZE) {
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        }

        // Deduplicate by id — safety net against any overlap between pages
        if (allData.length > 0) {
          const seen = new Set<string>();
          allData = allData.filter((item: any) => {
            const id = String(item[idKey]);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
          console.log(`[useSupabase] Loaded ${allData.length} unique rows from '${tableName}'`);
          const hydrated = rehydrateFromDb(tableName, allData) as unknown as T[];
          setData(hydrated);
          lastSyncedData.current = hydrated;
          dataRef.current = hydrated;
        }
        initialFetchDone.current = true;
      } catch (error: any) {
        console.warn(`[Offline Mode] Could not sync '${tableName}' with Supabase. Using local data. Error: ${error.message || 'Network request failed'}`);
        syncEnabled.current = false;
        initialFetchDone.current = true;
      }
    };
    fetchAll();

    // Re-fetch when the browser tab becomes visible again (fixes stale sessions)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && initialFetchDone.current && syncEnabled.current) {
        fetchAll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [tableName]);

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

    // Find items to insert or update
    const toUpsert = newData.filter((item: any) => {
      const id = String(item[idKey]);
      const oldItem = oldMap.get(id);
      return !oldItem || JSON.stringify(item) !== JSON.stringify(oldItem);
    });

    // Find items to delete
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
        // Safety: log what we're about to delete
        console.log(`[useSupabase:${tableName}] Deleting ${toDeleteIds.length} item(s)`);
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

  // Schedule a debounced sync — waits for mutations to settle before diffing
  const scheduleDebouncedSync = useCallback(() => {
    if (!syncEnabled.current || !initialFetchDone.current) return;

    // Clear any pending sync — only the latest state matters
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
    }

    syncTimer.current = setTimeout(() => {
      // Read the LATEST state from the ref (avoids stale closures entirely)
      const currentData = dataRef.current;
      const baseline = lastSyncedData.current;

      if (currentData !== baseline) {
        syncToSupabase(currentData, baseline);
        lastSyncedData.current = currentData;
      }
    }, 1500); // 1.5s debounce — allows rapid typing/mutations to accumulate
  }, [tableName, idKey]);

  const setSupabaseData = useCallback((action: React.SetStateAction<T[]>) => {
    setData(prev => {
      const newData = typeof action === 'function' ? (action as any)(prev) : action;
      return newData;
    });
    // Schedule a debounced sync instead of immediate Promise.resolve sync
    scheduleDebouncedSync();
  }, [scheduleDebouncedSync]);

  return [data, setSupabaseData];
}
