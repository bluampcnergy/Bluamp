
# System Reference & Version Rules Document: Datlion Cnergy Plant OS

**Version:** 1.0.0 (Deployment Ready)
**Status:** Immutable Source of Truth
**Scope:** Inventory Management, Production Tracking, QC, Finance, and AI Integration.

---

## 1. Architecture Overview

### Purpose
A unified Operating System for a Battery Assembly Plant. It manages the full lifecycle of a battery pack: Procurement (Invoice Scanning) $\to$ Raw Material Storage $\to$ Quality Testing $\to$ Production (WIP) $\to$ Finished Goods $\to$ Dispatch.

### Technology Stack
*   **Frontend:** React 18 (Vite), TypeScript, Tailwind CSS.
*   **Backend/Database:** Supabase (PostgreSQL).
*   **AI/Inference:**
    *   **Cloud:** Google Gemini 3 Flash (via `@google/genai`).
    *   **Local:** Ollama (Qwen2-VL) via Localhost Proxy.
    *   **OpenRouter:** OpenRouter Vision Models (Default: `nvidia/nemotron-nano-12b-v2-vl:free`).
*   **State Strategy:** Optimistic UI with `useSupabase` custom hook for synchronization.
*   **Persistence:** `localStorage` for user session and volatile AI settings; PostgreSQL for business data.

### Data Flow
1.  **Action:** User triggers an event (e.g., "Start Production").
2.  **Logic:** Frontend validation executes (e.g., checking stock levels).
3.  **Optimistic Update:** React State updates immediately for zero-latency feel.
4.  **Sync:** The `useSupabase` hook debounces the state change and upserts the specific row(s) to PostgreSQL.
5.  **AI Layer:** Unstructured inputs (PDFs/Images) are processed via stateless API calls to Gemini/Ollama, returning structured JSON which enters the flow at Step 1.

---

## 2. Modular Breakdown (Business Logic & Rules)

### Module A: AI Invoice Extraction Service
**Core Objective:** Convert unstructured PDF/Image invoices into a strict, validated JSON schema for database insertion.

**Functional Logic (The "Repair" Rule):**
LLMs often return truncated or malformed JSON. The system implements a strict "Repair & Parse" strategy.
1.  **Prompting:** Enforces strict type enumerations (`document_type`, `source_type`) and item naming conventions.
    *   *Rule:* Items classified as "Cell" MUST follow format `[Size] [Capacity] [Chemistry]`.
2.  **Raw Output:** The AI returns a string that may contain Markdown or be cut off.
3.  **Sanitization:** Remove Markdown code blocks.
4.  **Recovery (Critical):** If `JSON.parse` fails, the `repairJSON` function reconstructs the string by balancing braces and closing string literals.

**Critical Code Snippet (`services/geminiService.ts`):**
```typescript
// RULE: This function MUST exist to handle partial AI responses.
const repairJSON = (jsonStr: string): string => {
    let inString = false;
    let escaped = false;
    const stack: string[] = [];
    
    // Logic: Iterate char by char. Track state.
    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (char === '"' && !escaped) inString = !inString;
        else if (!inString) {
            if (char === '{') stack.push('}');
            else if (char === '[') stack.push(']');
            else if (char === '}' || char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
            }
        }
        if (char === '\\' && !escaped) escaped = true; else escaped = false;
    }
    
    let repaired = jsonStr;
    if (inString) repaired += '"'; // Close open string
    while (stack.length > 0) repaired += stack.pop(); // Close open objects/arrays
    return repaired;
};
```

---

### Module B: ID Generation & Lifecycle Traceability
**Core Objective:** Generate unique, non-colliding IDs for Batches and Units to ensure traceability from Raw Material to Finished Good.

**Functional Logic:**
To avoid predictable sequential IDs and ensure uniqueness without database round-trips:
1.  **Legacy Check:** If timestamp < `LEGACY_CUTOFF_TIMESTAMP` (approx Feb 8, 2025), use old format logic to preserve historical data integrity.
2.  **New Format:** `[RecipeName4Chars]-[Base36ReverseTimestamp]`.
    *   *Logic:* Reversing the timestamp puts milliseconds first, ensuring high entropy for human-readable strings.
    *   *Collision:* If exact millisecond match occurs, append A, B, C.

**Critical Code Snippet (`utils.ts`):**
```typescript
export const generateBatchId = (good: FinishedGood, allGoods: FinishedGood[], recipes: Recipe[]): string => {
    // 1. Clean Name: UpperCase, AlphaNumeric only, take first 4 chars.
    const cleanName = recipeName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 4);

    // 2. Generate Time Part: Jumbled/Shortened timestamp
    const tsStr = good.timestamp.toString();
    const reversedTsStr = tsStr.split('').reverse().join('');
    const timePart = parseInt(reversedTsStr, 10).toString(36).toUpperCase();

    return `${cleanName}-${timePart}`;
};
```

---

### Module C: Production Logic (WIP)
**Core Objective:** Consume raw materials (Stock Deduction) and create WIP items based on a BOM (Recipe).

**Functional Logic:**
1.  **Stock Availability Check:**
    *   Query `received_goods` for matches by Name or ID.
    *   **Rule:** FIFO (First-In-First-Out) logic is suggested via "Auto-Select" button in UI.
2.  **Deduction (Atomic-like):**
    *   Calculate `newQuantity = currentQuantity - required`.
    *   Remove specific Serial Numbers from `received_goods.serials` array if the item is tracked (Cells).
3.  **Creation:** Create `WIPItem` with `consumedSerials` map (Traceability Link).

**Input:** `selectedRecipe`, `quantity`.
**Output:** Mutated `received_goods` (stock down), New `wip_item` (WIP up).

---

### Module D: Testing & Grading Logic
**Core Objective:** Categorize battery cells based on performance data.

**Functional Logic:**
1.  **Input:** User uploads CSV or manually enters Voltage, Resistance, Capacity.
2.  **Config:** User defines `LowerLimit`, `UpperLimit`, `NumGrades`.
3.  **Binning Algorithm:**
    *   Calculate `Step = (Upper - Lower) / NumGrades`.

---

### Module E: Finance, Ledger & Audit Trail
**Core Objective:** Maintain accurate double-entry financial ledger view, party resolution, and revision audit logs for all accounting documents.

**Functional Logic:**
1. **Party Aggregation (`LedgerPanel.tsx`):**
   * Combines registered companies from `company_profiles` table with parties extracted from invoice issuer, receiver, and supplier details into a unified `allParties` list.
2. **Review Filtering:**
   * Fetches finalized documents with `.or('requires_review.eq.false,requires_review.is.null')`.
3. **Audit Trail Schema (`edit_history`):**
   * Edits and updates to invoices append log objects to `invoice_metadata.edit_history`:
     ```json
     [
       {
         "timestamp": "2026-08-11T10:00:00.000Z",
         "user": "admin",
         "action": "Update Document",
         "notes": "Updated invoice totals and line items"
       }
     ]
     ```
   * Rendered visually in `Dashboard.tsx` expandable row timeline.

---

## 3. Dependency Mapping

| Module | Depends On | Interaction Rule |
| :--- | :--- | :--- |
| **Testing** | `received_goods` | Cannot test items that don't exist. Matches by `id` and `serialNumber`. |
| **WIP (Production)** | `recipes`, `received_goods` | Requires defined Recipes. Consumes Stock from `received_goods`. |
| **Finished Goods** | `wip_items`, `recipes` | WIP items are "Finished" to become Finished Goods. Inherits traceability data. |
| **Invoice Maker** | `company_profiles` | Auto-fills Issuer/Receiver details from profiles. |
| **Storage** | `received_goods` | Can link storage items to inventory IDs for dynamic quantity updates. |

---

## 4. Error States & Handling

### Database Sync Failure (`hooks/useSupabase.ts`)
*   **Condition:** Network drop or Supabase table missing (`PGRST205`).
*   **Behavior:**
    1.  Console warning: `[Offline Mode] ... Disabling sync.`
    2.  `syncEnabled` ref is set to `false`.
    3.  App continues to work using **Local State** (React State) to prevent UI freezing.
    4.  **Note:** Data written during offline mode is **NOT** queued for retry in v1.0.0. A refresh will reset state to last DB fetch.

### Invoice Extraction Failure
*   **Condition:** AI returns garbage or JSON parse fails even after repair.
*   **Behavior:**
    1.  `extractInvoiceData` throws Error.
    2.  Queue Status becomes 'error'.
    3.  UI shows Red Alert icon.
    4.  User action: Click "Manual Entry" or Retry.

### Production Validation Error
*   **Condition:** User tries to start production with insufficient serials selected.
*   **Behavior:**
    1.  `handleStartWip` checks `selectedForThisItem.length !== required`.
    2.  Sets `error` state string.
    3.  Displays red alert banner in Modal: "Insufficient serials selected...".

---

## 5. Version Constraints (Immutable Rules)

These rules define the "Contract" of the application. Do not change them without a major version migration.

1.  **Master Item Naming:**
    *   Cells **MUST** contain the string "Cell" (case-insensitive) in their name or category to trigger Serial Number tracking grids.
    *   BMS **MUST** contain "BMS" (case-insensitive) to trigger specific logic.
    *   All other items are treated as "Bulk" (Quantity only).

2.  **Supabase Schema:**
    *   The table `invoices` uses a JSONB column (`items`, `totals`, `metadata`) for flexibility. Do **not** normalize these into separate SQL tables unless scaling issues arise (>1M rows).
    *   Row Level Security (RLS) is explicitly **DISABLED** in `schema.sql`. Security is handled at the application level via the `Auth` component (Simulated Admin/User roles).

3.  **Environment Variables:**
    *   The app uses a "Hardcoded Fallback" strategy for API Keys in `geminiService.ts` and `supabaseClient.ts` to ensure zero-config deployment for the demo/production build.
    *   **Rule:** `process.env` / `import.meta.env` takes precedence, but if missing, the hardcoded keys are used.

4.  **Invoice Totals Calculation:**
    *   Grand Total logic: `(Taxable + CGST + SGST + IGST)`.
    *   **Rule:** If `IGST Rate > 0`, `CGST` and `SGST` are forced to 0.

5.  **Storage ID Linkage:**
    *   Storage items can exist independently (Manual Mode) or be linked to Inventory (Linked Mode).
    *   **Rule:** If Linked, the Item Name in Storage **MUST** match the `received_goods` Name exactly.

---

## 6. Critical Data Types (`types.ts`)

Use this reference to ensure data consistency.

```typescript
export interface ReceivedGood {
  id: string;
  name: string;
  category: string; // Critical for logic branching (Cell vs Bulk)
  quantity: number;
  serials: string[]; // Critical for traceability
  gradingConfig?: { ... }; // Persisted QC settings
}

export interface FinishedGood {
  id: string;
  consumedSerials: { [receivedGoodId: string]: string[] }; // The Core Traceability Map
  dismantledUnitIds?: string[]; // Logic for voiding specific units
}

export interface ExtractedInvoice {
  source_type: 'sales' | 'purchase'; // Determines GST Logic
  items: InvoiceItem[];
  totals: { ... };
}
```
