
import type { FinishedGood, Recipe, ReceivedGood, TestResult } from './types';

// Timestamp cutoff for when we switched ID generation logic..
// Items created BEFORE this timestamp will use the old legacy logic to preserve history.
// Items created AFTER will use the new short/jumbled logic.
// Set to a recent timestamp (approx Feb 8, 2025).
const LEGACY_CUTOFF_TIMESTAMP = 1739000000000; 

export const generateBatchId = (good: FinishedGood, allGoods: FinishedGood[], recipes: Recipe[]): string => {
    const recipe = recipes.find(r => r.id === good.recipeId);
    const recipeName = recipe ? recipe.name : 'Unknown';
    
    // Generate prefix: First 4 chars of recipe name, uppercase, remove all non-alphanumeric chars (spaces, symbols)
    const cleanName = recipeName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const namePart = cleanName.substring(0, 4);

    // --- LEGACY LOGIC (For historical items) ---
    // If item was created before the update, reproduce the old ID format:
    // Format: NAME4-DDMMYY-HHMM[-SUFFIX]
    if (good.timestamp < LEGACY_CUTOFF_TIMESTAMP) {
        const dateObj = new Date(good.timestamp);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = String(dateObj.getFullYear()).slice(-2);
        const datePart = `${day}${month}${year}`;
        
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const timePart = `${hours}${minutes}`;

        // Legacy format used a different name cleaning (X for spaces) but let's stick to base reconstruction
        // The previous logic was: namePart + '-' + datePart + '-' + timePart
        // We will do best effort match. Since this function is mostly for display of *existing* items, 
        // if the ID is stored or deterministically reproducible, this is fine.
        // Actually, 'FinishedGoods' view uses this to *display* IDs.
        
        const baseId = `${namePart}-${datePart}-${timePart}`;
        
        // Legacy Collision Check (Approximate)
        if (allGoods && allGoods.length > 0) {
            const sameTimeGoods = allGoods.filter(g => {
                if (g.id === good.id) return true;
                if (g.recipeId !== good.recipeId) return false;
                const t = new Date(g.timestamp);
                // Check if minute matches
                return Math.floor(t.getTime() / 60000) === Math.floor(good.timestamp / 60000);
            });

            if (sameTimeGoods.length > 1) {
                sameTimeGoods.sort((a, b) => a.id.localeCompare(b.id));
                const index = sameTimeGoods.findIndex(g => g.id === good.id);
                if (index > 0) {
                    return `${baseId}-${index + 1}`; // Legacy used -1, -2 suffix
                }
            }
        }
        return baseId;
    }

    // --- NEW LOGIC (Short, Jumbled, Unique) ---
    // 1. Get timestamp as string
    const tsStr = good.timestamp.toString();
    // 2. Reverse digits: Puts rapidly changing milliseconds at the front, creating a "jumbled" non-sequential look
    const reversedTsStr = tsStr.split('').reverse().join('');
    // 3. Convert to Base36: Shortens the numeric string significantly
    const reversedNum = parseInt(reversedTsStr, 10);
    const timePart = reversedNum.toString(36).toUpperCase();

    const baseId = `${namePart}-${timePart}`;

    // Collision Check: Handle exact timestamp matches (rare, but possible in bulk ops)
    if (allGoods && allGoods.length > 0) {
        const sameTimeGoods = allGoods.filter(g => {
            if (g.id === good.id) return true; // Self
            if (g.recipeId !== good.recipeId) return false;
            return g.timestamp === good.timestamp;
        });

        if (sameTimeGoods.length > 1) {
            // Sort by ID to ensure deterministic suffix assignment
            sameTimeGoods.sort((a, b) => a.id.localeCompare(b.id));
            const index = sameTimeGoods.findIndex(g => g.id === good.id);
            if (index > 0) {
                // Append suffix letter for duplicates (A, B, C...)
                const suffix = String.fromCharCode(65 + (index - 1));
                return `${baseId}${suffix}`;
            }
        }
    }

    return baseId;
};

export const generateUnitIds = (good: FinishedGood, allGoods: FinishedGood[], recipes: Recipe[]): string[] => {
    const batchId = generateBatchId(good, allGoods, recipes);
    if (good.quantity <= 0) return [];
    
    const ids: string[] = [];
    const padding = String(good.quantity).length; 
    
    for (let i = 1; i <= good.quantity; i++) {
        ids.push(`${batchId}-${String(i).padStart(padding, '0')}`);
    }
    return ids;
};

export interface DueDateBadgeInfo {
  formattedText: string;
  dayOfWeek: string;
  ddmmyy: string;
  priority: 1 | 2 | 3 | 4;
  isOverdue: boolean;
  badgeClass: string;
  dotColor: string;
}

export const getDueDateBadgeInfo = (dueDateStr?: string): DueDateBadgeInfo | null => {
  if (!dueDateStr) return null;
  const parts = dueDateStr.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const targetDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const isOverdue = diffDays < 0;

  const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'short' });
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  const yy = String(year).slice(-2);
  const ddmmyy = `${dd}/${mm}/${yy}`;
  const formattedText = `${dayOfWeek}, ${ddmmyy}`;

  if (diffDays <= 0) {
    // Priority 1: Today or Overdue (Red / Crimson)
    return {
      formattedText,
      dayOfWeek,
      ddmmyy,
      priority: 1,
      isOverdue,
      badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300 font-bold',
      dotColor: 'bg-rose-600',
    };
  } else if (diffDays <= 7) {
    // Priority 2: Tomorrow till next week (1 to 7 days) (Amber / Yellow)
    return {
      formattedText,
      dayOfWeek,
      ddmmyy,
      priority: 2,
      isOverdue: false,
      badgeClass: 'bg-amber-100 text-amber-900 border border-amber-300 font-bold',
      dotColor: 'bg-amber-500',
    };
  } else if (diffDays <= 30) {
    // Priority 3: Next week till end of 30 days (8 to 30 days) (Emerald / Blue)
    return {
      formattedText,
      dayOfWeek,
      ddmmyy,
      priority: 3,
      isOverdue: false,
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold',
      dotColor: 'bg-emerald-500',
    };
  } else {
    // Priority 4: Beyond 30 days (Neutral Slate)
    return {
      formattedText,
      dayOfWeek,
      ddmmyy,
      priority: 4,
      isOverdue: false,
      badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200 font-medium',
      dotColor: 'bg-slate-400',
    };
  }
};

export const normalizeUnitId = (unitId: string, batchId?: string): string => {
  if (!unitId) return '';
  const clean = unitId.trim();
  if (batchId && !clean.startsWith(batchId)) {
    return `${batchId}-${clean}`;
  }
  return clean;
};

export const getUnitSerialsMap = (
  good: FinishedGood,
  unitId: string,
  allUnitIds?: string[]
): { [receivedGoodId: string]: string[] } => {
  const normId = normalizeUnitId(unitId);

  // 1. Preferred: Check unitComponentMap
  if (good.unitComponentMap && good.unitComponentMap[normId]) {
    return good.unitComponentMap[normId];
  }
  if (good.unitComponentMap && good.unitComponentMap[unitId]) {
    return good.unitComponentMap[unitId];
  }

  // 2. Backward-Compatibility Fallback for legacy records without unitComponentMap:
  const result: { [receivedGoodId: string]: string[] } = {};
  if (!good.consumedSerials) return result;

  let unitIndex = 0;
  if (allUnitIds && allUnitIds.length > 0) {
    const foundIdx = allUnitIds.findIndex(id => id === normId || id === unitId);
    if (foundIdx >= 0) unitIndex = foundIdx;
  } else {
    const match = unitId.match(/-(\d+)$/);
    if (match) unitIndex = Math.max(0, parseInt(match[1], 10) - 1);
  }

  const totalUnits = Math.max(1, good.quantity);

  for (const rgId in good.consumedSerials) {
    const serialList = good.consumedSerials[rgId] || [];
    if (serialList.length === 0) continue;

    const perUnitCount = Math.floor(serialList.length / totalUnits);
    if (perUnitCount > 0) {
      const startIdx = unitIndex * perUnitCount;
      const endIdx = (unitIndex === totalUnits - 1) ? serialList.length : startIdx + perUnitCount;
      result[rgId] = serialList.slice(startIdx, endIdx);
    } else {
      result[rgId] = serialList;
    }
  }

  return result;
};

export const getSerialParentGoodId = (
  serialNumber: string,
  finishedGood?: FinishedGood,
  testResults?: TestResult[],
  receivedGoods?: ReceivedGood[]
): string | null => {
  const cleanSerial = serialNumber.trim();
  if (!cleanSerial) return null;

  // 1. Check unitComponentMap if available
  if (finishedGood?.unitComponentMap) {
    for (const uId in finishedGood.unitComponentMap) {
      const compMap = finishedGood.unitComponentMap[uId];
      for (const rgId in compMap) {
        if (compMap[rgId].some(s => s.trim().toLowerCase() === cleanSerial.toLowerCase())) {
          return rgId;
        }
      }
    }
  }

  // 2. Check consumedSerials
  if (finishedGood?.consumedSerials) {
    for (const rgId in finishedGood.consumedSerials) {
      if (finishedGood.consumedSerials[rgId].some(s => s.trim().toLowerCase() === cleanSerial.toLowerCase())) {
        return rgId;
      }
    }
  }

  // 3. Check testResults
  if (testResults && testResults.length > 0) {
    const tr = testResults.find(r => r.serialNumber.trim().toLowerCase() === cleanSerial.toLowerCase());
    if (tr?.receivedGoodId) {
      return tr.receivedGoodId;
    }
  }

  // 4. Check existing receivedGoods
  if (receivedGoods && receivedGoods.length > 0) {
    const rg = receivedGoods.find(g => (g.serials || []).some(s => s.trim().toLowerCase() === cleanSerial.toLowerCase()));
    if (rg) return rg.id;
  }

  return null;
};

