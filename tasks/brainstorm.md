# Brainstorming & Architecture Exploration: Customer Management & Sales Pipeline Module (Simple Click-Based Flow)

## 1. Problem Statement & Core Goals

### User Vision & Guiding Principle
> **"Don't make it complicated. Make it simple, just clicks. If I'm a user, I see we need to send a quote, so I open Finance section, go to Invoice Maker, manually do things, and go to Home and tick the current task. It should be simple."**

### Core Requirements
1. **7 Linear Sales Stages**:
   1. `New Lead / Inquiry`
   2. `Follow-Up (Discovery & Engagement)`
   3. `Quotation Sent`
   4. `Negotiation / Revision`
   5. `Proforma Invoice (PI) Issued`
   6. `Payment Received / Won`
   7. `Closed / Lost` (simple 1-click reason dropdown)
2. **Role-Based Lead Assignment**:
   - **Admin/Manager Privilege**: Only admins assign or reassign leads.
   - **Restricted Visibility**: Reps only see their own assigned customers; Admins see a dropdown filter `[All Reps | Rahul | Priya | ...]`.
3. **Home Page Integration (Checkable Tasks)**:
   - When a follow-up or stage action is scheduled, it appears directly in the user's **Home Dashboard Task List**.
   - User does the work manually, goes to Home, and **ticks the checkbox `[✓]`** to mark it complete.
4. **Quick Drawer / Modal**:
   - Clean, lightweight drawer with customer details, notes history, next follow-up date picker, and stage changer.

---

## 2. Option Comparison Matrix

| Option | Architecture & Experience | Pros | Cons | Effort | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Option A: Simple Click-Based Kanban + Native Home Checkboxes (Recommended)** | **Visual 7-Stage Board + Lightweight Detail Drawer + Direct Home Page Task Sync**<br>• Click or drag to change stage<br>• Admin assigns via 1-click dropdown<br>• Follow-ups sync directly to `employee_tasks`<br>• User ticks checkbox on Home page when done | • Exactly matches the user's "keep it simple" vision<br>• Zero external dependencies or complex integrations<br>• Reps use familiar Invoice Maker manually<br>• Reuses existing `HomeDashboard` task checkbox system | Low–Medium (3–4 days) | Low |
| **Option B: List/Table-Only CRM** | **Single Spreadsheet-Style Table**<br>• Rows of leads with stage dropdown in each row<br>• Expandable sub-rows for notes<br>• Simple date picker | • Very compact<br>• Good for data-heavy sorting<br>• No drag-and-drop complexity | • Lacks visual pipeline flow<br>• Harder to see deals stuck in stages | Low (2 days) | Very Low |
| **Option C: Hybrid (Kanban + List Toggle with Quick Filters)** | **Kanban Board with 1-Click Toggle to Compact Table View**<br>• Reps can switch between Board and List<br>• 1-click stage advancement buttons on cards<br>• Native checkbox sync with Home page | • Best of both worlds (visual board + fast table)<br>• Flexible for different rep preferences | • Slightly more UI polish needed | Medium (4–5 days) | Low |

---

## 3. Recommended Approach: Simple Click-Based Workflow

### 1. The 7-Stage Board (Zero Complexity)
- **7 Clean Columns**: Each stage has its own column.
- **Card Contents (Minimal & Crisp)**:
  - Company / Prospect Name
  - Contact Person & Phone
  - Deal Value (₹) & Product Requirement
  - Current Assigned Rep
  - Next Follow-Up Date badge (e.g., `Due Today` in amber, `Overdue` in red)
- **Changing Stage**:
  - Drag the card to the next column **OR** click the stage pill on the card and pick the new stage from a dropdown.
- **If "Closed / Lost"**:
  - A small prompt asks: `Reason: [Pricing | Competitor | Specs Mismatch | Unresponsive | Other]`.

### 2. Role-Based Assignment & Confidentiality
- **Sales Rep Login**:
  - Automatically filtered to `assigned_to === currentUser.username`.
  - Reps only see their deals, keeping their view private and uncluttered.
- **Admin Login**:
  - Top filter: `Show: [All Reps | Rahul | Priya | Vikram | Unassigned]`.
  - On any lead card or inside the drawer: 1-click dropdown: `Assign To: [Select Rep]`.

### 3. Customer Detail Drawer (Simple Information & Notes)
Clicking any customer card slides out a simple side panel:
- **Client Profile**: Company Name, GSTIN, Contact Person, Phone, Email, Address.
- **Stage Changer**: 1 dropdown showing the 7 stages.
- **Set Next Follow-Up**:
  - Date Picker: Pick a date (e.g., `10/10/2026`).
  - Note: e.g., *"Call client about pricing revision"*.
  - When saved: **Automatically creates a task in `employee_tasks` for the assigned rep!**
- **Notes History**: Simple reverse-chronological list of notes logged by the rep.

### 4. The Home Page Checkbox Experience (`HomeDashboard.tsx`)
How the user works in practice:
1. Rep logs into Bluamp ➔ Lands on **Home Dashboard**.
2. Under **"My Tasks Today"**, they see:
   ```
   [ ] Follow-up with Rajesh (SolarTech Industries) - Send Quotation
   [ ] Call GreenVolt regarding technical specs
   ```
3. Rep sees they need to send a quote ➔ Clicks **Finance > Invoice Maker** in the top navigation.
4. Manually prepares the Quotation, downloads the PDF, and sends it to the customer via email/WhatsApp.
5. In the Sales Pipeline, they click the deal stage ➔ Switch to **"Quotation Sent"**.
6. Back on the **Home Page**, they simply **tick the checkbox `[✓]`** next to the task!
   - Task strikes through with a green checkmark!
   - Progress bar updates!
   - Done! Simple, clean, and satisfying.

---

## 4. Next Steps & Technical Implementation Plan
1. **Schema**: Create a simple `leads` table and link follow-up tasks to the existing `employee_tasks` table.
2. **Navigation**: Add a simple **"Sales"** or **"Pipeline"** entry in the navigation bar.
3. **UI Components**:
   - `components/crm/SalesPipeline.tsx` (Board + Simple Drawer)
   - Home Page task integration (already has checkbox logic in `HomeDashboard.tsx`).
