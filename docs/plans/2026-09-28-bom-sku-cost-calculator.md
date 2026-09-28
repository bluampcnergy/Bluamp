# BOM / SKU Internal Cost & Margin Spreadsheet Calculator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dense, Excel-style, in-place editable BOM (Bill of Materials) and SKU Cost Calculator that calculates component-level unit costs (excl. GST), overheads, and multi-tier pricing (Custom, Dealer 1.3x/30%, Retail 1.5x/50%) with and without GST in an ultra-compact single-screen interface.

**Architecture:** A high-density React spreadsheet component (`BomCostCalculator.tsx`) integrated directly into the Finance module (`finance_costing` sub-nav and `finance_prices` tab). It connects to Supabase `recipes` to auto-load BOM recipes and persist component costs, auto-suggests historical purchase prices from `received_goods` / `invoices`, and enables 1-click sync to the Master `price_list`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (dense spreadsheet design), Supabase PostgreSQL, Lucide / custom SVG icons.

---

## 1. Requirement & Formula Specification

### 1.1 Spreadsheet Table Columns (Component Cost Grid)
1. **Row #**: Sequential row counter (1, 2, 3...).
2. **Component / Item Name**: In-place editable text cell with suggestions from raw inventory (`received_goods`) and past purchase invoice items.
3. **Quantity per SKU**: In-place editable numeric cell (e.g. `8`, `1`, `0.5`).
4. **UOM**: In-place unit of measurement (e.g. `qty`, `pcs`, `m`, `g`, `sets`).
5. **Unit Cost (₹ Excl. GST)**: In-place editable currency input cell.
6. **Ext. Cost (₹ Excl. GST)**: Auto-calculated formula: `Quantity * Unit Cost`.
7. **Cost Share %**: Auto-calculated formula: `(Ext. Cost / Total Component Cost) * 100`.
8. **Actions**: Row deletion button (`×`).

### 1.2 Overheads / Additional Production Costs
- **Labor / Assembly Cost (₹ Excl. GST)**: In-place editable fixed cost per pack.
- **Consumables / Packaging / Freight (₹ Excl. GST)**: In-place editable fixed cost or percentage.
- **Total Base BOM Cost (Excl. GST)**: `Sum(Ext. Costs) + Overheads`.

### 1.3 Margin & Multiplier Tiers (Per User Specification)
| Tier | Default Multiplier | Default Markup % | Price Excl. GST Formula | GST Formula (18% default) | Final Price Incl. GST |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Base BOM Cost** | 1.00x | 0% | `Base Cost` | `Base Cost * (GST% / 100)` | `Base Cost + GST` |
| **Custom Margin** | Configurable | Configurable (e.g. 20%) | `Base Cost * (1 + Custom% / 100)` | `Price Excl. * (GST% / 100)` | `Price Excl. + GST` |
| **Dealer Margin** | **1.30x** | **30%** | `Base Cost * 1.30` | `Price Excl. * (GST% / 100)` | `Price Excl. + GST` |
| **Retail Margin** | **1.50x** | **50%** | `Base Cost * 1.50` | `Price Excl. * (GST% / 100)` | `Price Excl. + GST` |

All margin inputs are in-place editable so the user can freely tune percentages or multipliers dynamically.

---

## 2. Proposed UI/UX Layout ("Very Small Space & Excel Look")

```
+---------------------------------------------------------------------------------------------------------+
| [🧮 SKU / BOM Cost Sheet]  [Select SKU: 12.8V 12Ah ▾]  [SKU Name: 12.8V 12Ah EV]  [GST Rate: 18% ▾]    |
| [💾 Save Costs to Recipe]  [📋 Push to Price List]  [📥 Export CSV]  [+ Add Row]  [+ Add Overhead]     |
+---------------------------------------------------------------------------------------------------------+
| # | Component Name         | Qty | UOM  | Unit Cost (Excl GST) | Ext Cost (Excl GST) | Share % | Del   |
|---|------------------------|-----|------|----------------------|---------------------|---------|-------|
| 1 | 3.2V 6000mAh LFP Cell  | 8   | pcs  | ₹ 185.00             | ₹ 1,480.00          | 68.2%   | [x]   |
| 2 | 4S 20A Smart BMS       | 1   | pcs  | ₹ 450.00             | ₹   450.00          | 20.7%   | [x]   |
| 3 | Pure Nickel Strip 0.15 | 2   | m    | ₹  25.00             | ₹    50.00          |  2.3%   | [x]   |
| 4 | ABS Battery Casing     | 1   | pcs  | ₹ 140.00             | ₹   140.00          |  6.5%   | [x]   |
| 5 | Wiring Harness + XT60  | 1   | set  | ₹  50.00             | ₹    50.00          |  2.3%   | [x]   |
+---+------------------------+-----+------+----------------------+---------------------+---------+-------+
|   | Raw Material Subtotal:               |                      | ₹ 2,170.00          | 100.0%  |       |
|   | Labor & Assembly Cost:               |                      | ₹   120.00          |         |       |
|   | Packaging & Consumables:             |                      | ₹    60.00          |         |       |
|   | TOTAL BASE BOM COST (Excl. GST):     |                      | ₹ 2,350.00          |         |       |
+---+--------------------------------------+----------------------+---------------------+---------+-------+
| PRICING & MARGIN MATRIX (Excl. & Incl. GST):                                                            |
| +------------------+-------------------+----------------+----------------+----------------+-----------+ |
| | Tier             | Margin / Multiplier| Profit (Excl)  | Price Excl GST | GST (18%)      | Total Incl| |
| +------------------+-------------------+----------------+----------------+----------------+-----------+ |
| | Base BOM Cost    | 0% (Cost Baseline)| ₹ 0.00         | ₹ 2,350.00     | ₹ 423.00       | ₹ 2,773.00| |
| | Custom Tier      | [ 20 ] % (1.20x)  | ₹ 470.00       | ₹ 2,820.00     | ₹ 507.60       | ₹ 3,327.60| |
| | Dealer Tier      | [ 30 ] % (1.30x)  | ₹ 705.00       | ₹ 3,055.00     | ₹ 549.90       | ₹ 3,604.90| |
| | Retail Tier      | [ 50 ] % (1.50x)  | ₹ 1,175.00     | ₹ 3,525.00     | ₹ 634.50       | ₹ 4,159.50| |
| +------------------+-------------------+----------------+----------------+----------------+-----------+ |
+---------------------------------------------------------------------------------------------------------+
```

---

## 3. Tasks Breakdown

### Task 1: Type Definitions Update
**Files:**
- Modify: `types.ts:2-27` (Add `finance_costing` to `View`)
- Modify: `types.ts:152-164` (Update `RecipeComponent` and `Recipe` to support `unitCost`, `overheadCost`, `dealerMarginPercent`, `retailMarginPercent`, `customMarginPercent`, `gstRate`)

**Step 1: Update `types.ts`:**
```typescript
export interface RecipeComponent {
  masterItemName?: string;
  receivedGoodId?: string;
  quantityPerUnit: number;
  uom?: string;
  unitCost?: number; // Cost per unit excluding GST
}

export interface Recipe {
  id: string;
  name: string;
  components: RecipeComponent[];
  overheadCost?: number; // Labor / packaging / assembly cost
  customMarginPercent?: number; // e.g. 20%
  dealerMarginPercent?: number; // e.g. 30% (1.3x)
  retailMarginPercent?: number; // e.g. 50% (1.5x)
  gstRate?: number; // e.g. 18%
  notes?: string;
}
```

---

### Task 2: Build the Compact Excel-Style `BomCostCalculator` Component
**Files:**
- Create: `components/invoices/BomCostCalculator.tsx`

**Features implemented:**
1. **Interactive Excel Grid State**:
   - `rows`: Array of `{ id, name, qty, uom, unitCost, notes }`.
   - `overheadLabor`: Number (excl. GST).
   - `overheadPackaging`: Number (excl. GST).
   - `customMarginPercent`: Number (e.g. 20%).
   - `dealerMarginPercent`: Number (default: 30%, multiplier 1.3x).
   - `retailMarginPercent`: Number (default: 50%, multiplier 1.5x).
   - `gstRate`: Number (default: 18%).
2. **Keyboard Navigation & In-Place Editing**:
   - Tab / Enter auto-advances to the next cell.
   - Number inputs auto-format cleanly with currency prefix and high precision.
3. **BOM / SKU Loader**:
   - Select dropdown to instantly populate from existing `recipes`.
   - Auto-matches components with `receivedGoods` to suggest recent unit purchase prices.
4. **Live Calculation Formulas**:
   - `extCost = qty * unitCost`
   - `rawMaterialCost = sum(extCost)`
   - `baseBomCost = rawMaterialCost + overheadLabor + overheadPackaging`
   - For each tier (Base, Custom, Dealer, Retail):
     - `priceExclGst = baseBomCost * (1 + marginPercent / 100)`
     - `profitExclGst = priceExclGst - baseBomCost`
     - `gstAmount = priceExclGst * (gstRate / 100)`
     - `priceInclGst = priceExclGst + gstAmount`
5. **1-Click Sync Actions**:
   - `💾 Save Costs to Recipe`: Updates Supabase `recipes` table with component unit costs and margins.
   - `📋 Push to Price List`: Directly adds or updates the item in `price_list` with Dealer & Retail pricing.
   - `📥 Export CSV / Copy`: Instant clipboard copy in tab-delimited format (pasteable directly into Excel/Google Sheets).

---

### Task 3: Integrate into Navigation & Invoice Module
**Files:**
- Modify: `components/invoices/InvoiceModule.tsx` (Add `'costing'` to `ActiveTab`, render `BomCostCalculator`)
- Modify: `components/Header.tsx` (Add `finance_costing` to `categories.finance` and sub-nav button)
- Modify: `components/invoices/PriceList.tsx` (Add tab toggle between "Master Price List" and "BOM Cost Calculator")
- Modify: `App.tsx` (Pass `setRecipes` and `receivedGoods` to `InvoiceModule` if not already passed)

---

### Task 4: Testing & Verification
**Steps:**
1. Run `npx tsc --noEmit` to verify type safety.
2. Run `npm run build` to verify production bundle compilation.
3. Test edge cases:
   - Zero quantity or zero cost.
   - Fractional quantities (e.g., 0.5 meters of nickel strip, 150 grams).
   - Switching SKUs dynamically.
   - Editing margins (e.g. 1.3x / 30%, 1.5x / 50%) and checking GST calculations.
   - Pushing calculated prices to the Price List.
