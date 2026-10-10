# Brainstorming & Architecture Exploration: Multi-Brand Codebase Synchronization (`DC_Inventory_190526` & `Bluamp Main`)

## 1. Problem Statement & Core Goals

### Context & Current State
- **Two Parallel Projects**:
  - **Main / Upstream Project**: `DC_Inventory_190526` (GitHub: `indrajeetmdate/Datlion-Cnergy.git`, VPS Supabase `https://supabase.cnergy.co.in`, Datlion Cnergy branding & Lime `#8EBF45` palette).
  - **Secondary Project**: `Bluamp Main` (GitHub: `bluampcnergy/Bluamp.git`, Supabase Cloud `https://ofnwuifgzqjmmnsqsoed.supabase.co`, Bluamp Energy branding & Teal `#205f64` palette).
- **Core Similarity**: 98%+ of business logic, ERP workflows, Invoice Maker, BOM costing, cell testing, and newly built modules (Sales CRM, Technical Battery Sizing) are functionally identical. `schema.sql` is currently 100% matched.
- **Current Pain Points**:
  - Manually porting features or bug fixes back and forth consumes double the engineering time.
  - High risk of code drift, broken schemas, missed bug fixes, and divergent feature sets.
  - Separate GitHub accounts and separate hosting deployments make manual synchronization error-prone.

### Core Goals & Non-Negotiable Constraints
1. **Single Source of Truth**: All primary development and debugging happens in `DC_Inventory_190526`.
2. **Zero Schema & UI Breakage**: Deployments must retain their respective branding, logos, theme colors, admin credentials, and database connections.
3. **Automated / 1-Step Sync**: Syncing changes from `DC_Inventory_190526` to `Bluamp Main` should take seconds (one command or automated trigger).
4. **Clean Git Isolation**: Maintain separate GitHub accounts/repos without git conflicts, history rewrites, or credential cross-contamination.

---

## 2. Option Comparison Matrix

| Option | Architecture & Sync Flow | Pros | Cons | Effort | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Option 1: Single Multi-Tenant / Config-Driven App** | One shared codebase using `.env` (`VITE_APP_BRAND=dc\|bluamp`), brand profile provider, and a database adapter layer. | • Exactly 1 codebase to maintain.<br>• Features and bug fixes apply instantly to both.<br>• Minimal bundle overhead.<br>• Clean architecture. | • Requires refactoring hardcoded brand strings and colors into theme variables.<br>• Dual deployment configuration required. | Medium (1–2 days) | Low |
| **Option 2: Monorepo Architecture (`packages/core` + apps)** | Workspaces (pnpm/Turborepo) with `packages/core` for backend logic/services and two separate apps (`apps/dc`, `apps/bluamp`). | • Strict architectural boundary between core logic and branded apps.<br>• Allows UI to diverge dramatically if needed in future. | • Massive setup overhead (workspaces, tsconfig, build pipelines).<br>• Breaking change to folder structures.<br>• Complex to publish apps to 2 separate GitHub repos. | High (4–6 days) | Medium–High |
| **Option 3: AI-Assisted Migration** | Keep two completely independent repositories; use AI diff prompts to port changes per feature. | • Zero upfront refactoring.<br>• Repositories stay totally decoupled. | • Does not solve the root problem: still requires manual triggers, testing, and reviews.<br>• Inevitable drift, regressions, and schema mismatches over time. | Low upfront, High ongoing | High |
| **Option 4: (RECOMMENDED) White-Label Core Engine + Dual-Remote Push / Git Sync Action** | `DC_Inventory_190526` is the canonical master repository. A lightweight Brand Profile layer + CSS variables dynamically skin the app. Secondary GitHub remote (`bluamp`) is pushed via 1-click script or GitHub Action. | • Combines the simplicity of a single codebase with the independence of two GitHub repos.<br>• Zero duplicate code.<br>• Both GitHub repositories receive the exact same git commits automatically.<br>• 100% safe, fast, and transparent. | • Initial one-time extraction of brand constants into a `brand.config.ts`. | Medium (1–2 days) | Very Low |

---

## 3. Recommended Approach & Rationale: Option 4 (White-Label Core Engine + Dual-Remote Git Sync)

### Why Option 4 is the Best & Safest Solution

Our code inspection of both `DC_Inventory_190526` and `Bluamp Main` revealed that:
1. `schema.sql` and the underlying database tables are already **identical**.
2. Differences in files are limited to:
   - **Company Identity**: "Datlion Cnergy" vs "Bluamp Energy"
   - **Admin Email**: `datlioncnergy@gmail.com` vs `bluampcnergy@gmail.com`
   - **Primary Palette**: `#8EBF45` (Lime) vs `#205f64` (Teal)
   - **Logo Assets**: `public/logos/...`
   - **Supabase Environment Credentials**: VPS Supabase vs Supabase Cloud
3. Creating a full Monorepo (Option 2) introduces excessive complexity without solving the separate GitHub account push problem.
4. AI-assisted porting (Option 3) keeps you tethered to manual copy-paste overhead forever.

---

## 4. Step-by-Step Implementation Blueprint

### Step 1: Centralized Brand Profile (`src/config/brand.ts`)
Extract all brand-specific differences into a single type-safe configuration file:

```typescript
// src/config/brand.ts
export interface BrandConfig {
  id: 'dc' | 'bluamp';
  companyName: string;
  shortName: string;
  defaultAdminEmail: string;
  logo: {
    navbar: string;
    white: string;
    invoice: string;
  };
  colors: {
    primary: string;       // e.g. '#8EBF45' for DC, '#205f64' for Bluamp
    primaryHover: string;  // e.g. '#7cb037' for DC, '#18484c' for Bluamp
    primaryLight: string;  // e.g. '#f4f9ed' for DC, '#f0fdf4' for Bluamp
    accentDark: string;    // e.g. '#0D0D0D' for DC, '#0A3F44' for Bluamp
  };
  defaultSupabaseUrl: string;
  defaultSupabaseKey: string;
}

export const BRANDS: Record<'dc' | 'bluamp', BrandConfig> = {
  dc: {
    id: 'dc',
    companyName: 'Datlion Cnergy Private Limited',
    shortName: 'Datlion Cnergy',
    defaultAdminEmail: 'datlioncnergy@gmail.com',
    logo: {
      navbar: '/logos/cnergy-logo.png',
      white: '/logos/cnergy-logo-white.png',
      invoice: '/logos/cnergy-logo.png'
    },
    colors: {
      primary: '#8EBF45',
      primaryHover: '#7cb037',
      primaryLight: '#f6fbf0',
      accentDark: '#0D0D0D'
    },
    defaultSupabaseUrl: 'https://supabase.cnergy.co.in',
    defaultSupabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  },
  bluamp: {
    id: 'bluamp',
    companyName: 'Bluamp Energy Private Limited',
    shortName: 'Bluamp Energy',
    defaultAdminEmail: 'bluampcnergy@gmail.com',
    logo: {
      navbar: '/logos/bluamp-logo.png',
      white: '/logos/bluamp-logo-white.png',
      invoice: '/logos/bluamp-logo.png'
    },
    colors: {
      primary: '#205f64',
      primaryHover: '#18484c',
      primaryLight: '#f0fdfa',
      accentDark: '#0A3F44'
    },
    defaultSupabaseUrl: 'https://ofnwuifgzqjmmnsqsoed.supabase.co',
    defaultSupabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
};

// Auto-detected via VITE_APP_BRAND environment variable, defaulting to 'dc'
export const getActiveBrand = (): BrandConfig => {
  const brandKey = (import.meta.env.VITE_APP_BRAND as 'dc' | 'bluamp') || 'dc';
  return BRANDS[brandKey] || BRANDS.dc;
};
```

### Step 2: Dynamic Theme Injection & Tailwind Integration
In `index.html` or `App.tsx`, inject root CSS variables on startup:
```typescript
const brand = getActiveBrand();
document.documentElement.style.setProperty('--brand-primary', brand.colors.primary);
document.documentElement.style.setProperty('--brand-primary-hover', brand.colors.primaryHover);
document.documentElement.style.setProperty('--brand-primary-light', brand.colors.primaryLight);
```
In `tailwind.config.js`:
```javascript
theme: {
  extend: {
    colors: {
      brand: {
        primary: 'var(--brand-primary)',
        hover: 'var(--brand-primary-hover)',
        light: 'var(--brand-primary-light)',
      }
    }
  }
}
```
All UI elements simply use `bg-brand-primary` and `text-brand-primary`. It automatically renders Lime Green for DC and Teal for Bluamp.

### Step 3: Database Mapping / Normalization Layer
If table or column names differ across the two databases, use a lightweight query mapping helper:
```typescript
// utils/dbSchemaMap.ts
const brand = getActiveBrand();

export const DB_COLUMNS = {
  dc: {
    customerName: 'customer_name',
    invoiceNumber: 'invoice_number'
  },
  bluamp: {
    customerName: 'client_name',
    invoiceNumber: 'invoice_no'
  }
}[brand.id];
```
*(Recommendation: Run a one-time `ALTER TABLE ... RENAME COLUMN ...` in Supabase to align column names completely, eliminating the mapping layer entirely).*

### Step 4: Dual-Remote Git Configuration in `DC_Inventory_190526`
In your main project folder `d:\Projects\DC_Inventory_190526`:
```powershell
# 1. Check existing origin (Datlion-Cnergy)
git remote -v

# 2. Add Bluamp as a secondary remote
git remote add bluamp https://bluampcnergy:ghp_TOKEN@github.com/bluampcnergy/Bluamp.git

# 3. Add a 1-click sync script in package.json:
# "scripts": {
#   "sync:both": "git push origin main && git push bluamp main"
# }
```

### Step 5: Automated GitHub Action (Alternative Zero-Touch Option)
Whenever you push to `main` in `Datlion-Cnergy`, a GitHub Action automatically mirrors the push to `bluampcnergy/Bluamp`:
```yaml
# .github/workflows/sync-bluamp.yml
name: Sync to Bluamp Repository
on:
  push:
    branches: [ main ]
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Push to Bluamp
        env:
          BLUAMP_PAT: ${{ secrets.BLUAMP_GITHUB_TOKEN }}
        run: |
          git remote add bluamp https://${BLUAMP_PAT}@github.com/bluampcnergy/Bluamp.git
          git push bluamp main --force
```

---

## 5. Transition & Next Steps

1. **Step 1: First-Time Code Convergence**:
   - Port the recent additions (`SalesCrmPanel.tsx`, `TechnicalBatterySizingSheet.tsx`) and invoice fixes from `Bluamp Main` into `DC_Inventory_190526`.
2. **Step 2: Implement `src/config/brand.ts`**:
   - Centralize logos, company names, admin emails, and brand colors.
3. **Step 3: Test Local Switching**:
   - Set `VITE_APP_BRAND=dc` in `.env` ➔ verify DC lime theme & logos.
   - Set `VITE_APP_BRAND=bluamp` in `.env` ➔ verify Bluamp teal theme & logos.
4. **Step 4: Connect Git Remotes & Push**:
   - Push to both GitHub repos. Both deployments (DC VPS / Vercel & Bluamp Vercel) will build cleanly from their respective environment variables.
