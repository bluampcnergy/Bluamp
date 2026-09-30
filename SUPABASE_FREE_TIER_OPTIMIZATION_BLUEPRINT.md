# 🚀 Supabase Free Tier Resource Optimization Blueprint

## Executive Summary & Objective

This document provides a step-by-step replication guide and architectural blueprint for optimizing Supabase database resource utilization on the **Free Tier (or low-spec Postgres instances)** without purchasing upgraded infrastructure.

By applying these optimizations, you resolve:
* **Postgres Connection Pool Exhaustion** (522/524 errors, "Unhealthy" database status).
* **High CPU / Memory spikes** caused by unindexed JSONB query scans.
* **Redundant API call churn** triggered by tab switching or multi-hook initializations.

---

## ⚠️ Potential Trade-Offs & Downsides (With Mitigations)

Before replicating, understand the engineering trade-offs of client-side caching and concurrency limits:

| Feature / Change | Potential Trade-Off / Downside | How It Is Mitigated |
| :--- | :--- | :--- |
| **5-Minute Memory Caching** | If another concurrent user modifies data in Supabase, the current user won't see external changes for up to 5 minutes unless they switch tabs or trigger an action. | Local mutations (adds/edits/deletes by the active user) immediately update the local state & cache. A soft re-fetch triggers automatically when switching browser tabs (after a 60-second cooldown). |
| **Capped Initial Limits (e.g. 200 items)** | Only the latest 200 invoices / 300 logs are loaded by default. Very old historical records won't appear in instant search without filtering. | Users can use the **Date Range Filters** (`From Date` / `To Date`) to query specific historical timeframes from Postgres. |
| **Client-Side In-Memory Search** | If a dataset grows beyond 5,000 items in memory, client-side filtering might consume client RAM. | Query limits (e.g. 200–500 rows) ensure client RAM consumption remains minimal (< 5 MB). |

---

## 🛠️ Step-by-Step Replication Blueprint

### Step 1: Global Concurrency Semaphore & Memory Caching (`hooks/useSupabase.ts`)

Replace standard direct `useEffect` fetches with a semaphore queue and an in-memory cache with a Time-To-Live (TTL).

```typescript
// ============================================================
// 1. GLOBAL IN-MEMORY CACHE WITH TTL (5 MINUTES)
// ============================================================
interface CacheEntry {
  data: any[];
  timestamp: number;
}
const MEMORY_CACHE: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes fresh data window

const getValidCache = (tableName: string): any[] | null => {
  const entry = MEMORY_CACHE[tableName];
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
};

const setCache = (tableName: string, data: any[]) => {
  MEMORY_CACHE[tableName] = { data, timestamp: Date.now() };
};

// ============================================================
// 2. GLOBAL FETCH QUEUE (Semaphore max 3 concurrent calls)
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
```

---

### Step 2: Client-Side In-Memory Search & Query Capping (`components/invoices/Dashboard.tsx`)

Instead of sending an `ILIKE` query across JSONB columns on every keypress, fetch a capped dataset (e.g. 200 rows) and filter using `useMemo`.

```typescript
// 1. Fetch capped dataset on category/date change (remove searchTerm dependency)
const fetchInvoices = async () => {
    setLoading(true);
    let query = supabase
        .from('invoices')
        .select('*')
        .eq('source_type', invoiceType)
        .order('created_at', { ascending: false })
        .limit(200); // Prevent unbounded table scans

    const { data, error } = await query;
    if (!error) setInvoices(data as ExtractedInvoice[]);
    setLoading(false);
};

useEffect(() => {
    fetchInvoices();
}, [filterStart, filterEnd, invoiceType, documentCategory]);

// 2. Fast in-memory search filter (0ms latency, 0 DB calls)
const filteredInvoices = React.useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const term = searchTerm.toLowerCase();
    return invoices.filter(inv => {
        const invNo = String(inv.invoice_metadata?.invoice_number || '').toLowerCase();
        const issuer = String(inv.issuer_details?.name || '').toLowerCase();
        const receiver = String(inv.receiver_details?.name || '').toLowerCase();
        return invNo.includes(term) || issuer.includes(term) || receiver.includes(term);
    });
}, [invoices, searchTerm]);
```

---

### Step 3: Batch Array Operations for API Calls (`components/Webmail.tsx`)

Avoid running `upsert` or `insert` calls in a `for...of` loop. Group objects into a single array payload.

```typescript
// BAD: Loop with individual connection handshakes
// for (const acc of newAccounts) { await supabase.from('webmail_accounts').upsert(acc); }

// GOOD: Single batch array payload
const rows = newAccounts.map(acc => ({
    id: acc.id,
    username: activeUsername,
    email: acc.email,
    sender_name: acc.senderName,
    auth_password: acc.password || '',
    updated_at: Date.now()
}));
await supabase.from('webmail_accounts').upsert(rows);
```

---

### Step 4: Single-Execution Ref Guard for Auth Checks (`App.tsx`)

Ensure `getSession()` and authentication token verification calls do not run repeatedly on every state change.

```typescript
const hasMigratedAuthRef = useRef(false);
useEffect(() => {
  if (hasMigratedAuthRef.current) return;
  
  const migrateExistingSession = async () => {
    hasMigratedAuthRef.current = true;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session && currentUser?.password) {
      await supabase.auth.signInWithPassword({
        email: currentUser.username,
        password: currentUser.password
      });
    }
  };
  
  migrateExistingSession();
}, [currentUser]);
```

---

### Step 5: Database Indexing SQL (Execute in Supabase SQL Editor)

Run these SQL statements on the target Supabase project to speed up JSONB queries and reduce database CPU load:

```sql
-- Index nested JSONB fields for fast lookups
CREATE INDEX IF NOT EXISTS idx_invoices_metadata_number 
ON invoices ((invoice_metadata->>'invoice_number'));

CREATE INDEX IF NOT EXISTS idx_invoices_issuer_name 
ON invoices ((issuer_details->>'name'));

CREATE INDEX IF NOT EXISTS idx_invoices_receiver_name 
ON invoices ((receiver_details->>'name'));
```

---

## 📋 Replication Checklist

- [ ] **Copy `useSupabase.ts` Queue & Cache Logic**: Add `MEMORY_CACHE` with 5-min TTL and `MAX_CONCURRENT_FETCHES = 3`.
- [ ] **Cap `select('*')` Limits**: Add `.limit(200)` to large table fetches (`logs`, `test_results`, `invoices`).
- [ ] **Convert Search to `useMemo`**: Replace `ILIKE` database queries in dashboard tables with in-memory array filtering.
- [ ] **Batch Database Upserts**: Audit all `supabase.from().upsert()` loops and combine into array payloads.
- [ ] **Run Postgres GIN/Functional Indexes**: Execute the SQL snippet in the Supabase Dashboard SQL Editor.
- [ ] **Test Build**: Run `npm run build` to confirm zero TypeScript compilation errors.
