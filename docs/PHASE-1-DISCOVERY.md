# Powerline Customer Portal — Phase 1 Discovery Report

**Date:** 2026-08-13
**Inputs analysed:**
- `Powerline_Customer_Portal_Package.pdf` — 14 pages (10 spec sections + 3 UI mockups). Read in full, including the three mockup images.
- `PM Phase Cycle Times - Open Backlog_2018-01-01_2026-08-11 (1).xlsx` — 1 sheet (`Query Report`), 480 data rows × 58 columns. Every column profiled; every derived metric formula reverse-engineered and verified.

**Status:** Discovery only. No application code written. Awaiting approval.

---

## A. Product understanding

### What the portal does

A **read-only** web portal where a Powerline customer logs in and sees, without phoning a project manager:

1. **Where every panel is** in the production journey (7 stages), with planned vs actual dates.
2. **What they owe** — contract value, invoices, payments, outstanding, overdue.
3. **Their documents** — FAT reports, delivery notes, invoices as PDFs.
4. **Email alerts** when something meaningful changes.

ERPNext stays the single source of truth. The portal **writes nothing back** in Phase 1. Critically: **no status is ever typed by a human** — all 7 stage statuses are *computed* from documents Powerline staff already create (Request For Design, Work Order, Stock Entry, Delivery Note, Sales Invoice, Payment Entry). This is the single most important design constraint in the whole brief.

### Who uses it

| Actor | Role |
|---|---|
| Customer contact — "admin contact" | Sees everything including finance |
| Customer contact — engineer | Sees progress only, **no financials** (flag-controlled) |
| Powerline staff | Do *not* use the portal; they keep working in ERPNext. The portal is a projection of their work |
| Portal service user | A dedicated restricted ERPNext user (`portal-api@powerline.com.eg`) whose API key lives only in the BFF |

One login = one Contact = exactly **one** Customer. Multiple contacts per customer are supported.

### Main screens

1. **Login** — email + password, OTP option.
2. **Dashboard** — 5 KPI tiles (contract value / paid / outstanding / overdue / needs-your-action) + one card per active project with % complete, next milestone, financial snapshot, red badge for overdue or customer-blocked items.
3. **Projects** — list of the customer's sales orders.
4. **Project detail** — header (SO no., PO no., contract value, contractual delivery date, PM) + one row per item.
5. **Item timeline** — the signature screen. Per item, a time-scaled **dual-lane bar**: upper lane = *planned* 7 stages in light tints, lower lane = *actual* filled solid, a vertical **Today** line across both, overrun highlighted as delay, hover tooltip showing planned start/end, actual start/end and variance in days.
6. **Finance** — summary tiles, invoice table with PDF download, payment history, payment schedule per term, statement of account PDF.
7. **Documents** — FAT reports, delivery notes, invoices, filterable per project/item, streamed through the BFF.

### The 7 stages

| # | Stage | Statuses | Computed from |
|---|---|---|---|
| 1 | **Drawings Approval** | Under preparation → Sent for approval → Approved | Request For Design (type = Initial Approval / Revision / Release) |
| 2 | **Material Readiness** | Not Available → Partially Available → Fully Available | Work Order `material_status` |
| 3 | **Manufacturing** | Not Started → In Progress → Completed | Work Order `status` |
| 4 | **FAT** | Not Ready → FAT Invitation → FAT Success (+ Rework In Progress / Rework Done) | Work Order status + Stock Entry "Transfer To Finished Goods" |
| 5 | **Pre-Delivery Payment** | Not Ready → Delivery Payment Due → Paid | Payment Entry allocated to the order |
| 6 | **Delivery Readiness** | Not Ready → Ready → Delivered | Stock Entry (FG transfer) + Delivery Note |
| 7 | **Financial Clearance** | Waiting for Invoice → Invoice Submitted → Not Paid → Paid | Sales Invoice `docstatus` / `outstanding_amount` |

The tracker is **one per Work Order**, i.e. one per Sales Order item line. The Work Order is the anchor — it links back to `sales_order` and `sales_order_item`.

### What customers are allowed to see

Their own orders, items, quantities, cubicle counts, stage statuses, planned/actual milestone dates, contract value, payment schedule, invoices, payments, outstanding and overdue amounts, FAT reports, delivery notes, and their PM's name. Always in **document currency, never converted**.

### What customers must never see

This is a hard rule (PDF §2 and §7.3):

- Any **cost or margin** field on Work Order — `bom_material_cost`, `actual_material_cost`, `martial_cost`, `rate`, operating costs
- **BOM contents**
- **Supplier data**
- **Internal remarks / comments**
- **Rework reasons and comments** — the customer sees only a neutral "final quality adjustments in progress"
- **Employee emails**
- **Warehouse names**
- Any **other customer's data** — tenant isolation is an automated-test gate

---

## B. Excel analysis

### What this file actually is

**`PM Phase Cycle Times — Open Backlog`.** Two words matter enormously:

- **"Phase Cycle Times"** — it is an *internal operations KPI report*, built to measure how long each internal phase takes. It is not a customer-facing extract.
- **"Open Backlog"** — it is **filtered to undelivered order lines only**. Proof: `Delivered Qty` is 0 on 469 of 480 rows, and the 11 non-zero rows are partial (0.9). Delivered/closed lines are excluded from the export entirely.

**Consequence:** this file can tell us what is *in progress*. It cannot tell us what a project's full scope was, and it **cannot be used to compute "% delivered"** — every project would falsely appear 0% delivered.

### Shape and grain

| Property | Value |
|---|---|
| Rows | 480 data rows (+1 header) |
| Columns | 58 |
| Grain | **One Sales Order item line** |
| Distinct Sales Orders | 152 |
| Distinct Projects | 152 — **strict 1:1 with Sales Order** (0 projects with >1 SO, 0 SOs with >1 project) |
| Distinct Customers | 107 |
| Distinct Project Managers | 7 |
| Work Orders referenced | 355 rows have one; 28 rows carry **multiple comma-joined** WO ids |
| Rows with no Work Order at all | 125 |
| Export "as-of" date | **2026-08-11** (verified: `SO Submitted + Age Since SO` = 2026-08-11 exactly) |
| Backlog value total | 324,902,391.01 (currency **not stated in the file**) |

**Grain warning:** `(Sales Order, Item)` is *not* unique — 4 groups collide (e.g. `SO-22-00512 / P-SEC24N3F1` appears 3× with qty 12, 1 and 8 and different Work Orders). The true key is the ERPNext **Sales Order Item child row** (`name`/`idx`), which **is not exported**. We therefore have no stable line identifier. See gaps.

### Verified derived-metric formulas

Every `T*` column was reverse-engineered and tested against all 480 rows. All eight match **100%** with zero exceptions:

| Column | Formula | Rows verified |
|---|---|---|
| T1 Drawings Submission (d) | `IA Submitted − SO Submitted` | 304/304 |
| T2 Customer Approval (d) | `Rel Created − IA Submitted` | 197/197 |
| T3 WO Release (d) | `Rel Submitted − Rel Created` | 304/304 |
| T4 Material (d) | `Main Material Ready − Rel Submitted` | 205/205 |
| T5 Manufacturing (d) | `Main Closed − Main Material Ready` | 174/174 |
| T6 Rework Release (d) | `Rework Created − Main Closed` | 26/26 |
| T7 Rework Material (d) | `Rework Material Ready − Rework Created` | 23/23 |
| T8 Rework Manufacturing (d) | `Rework Closed − Rework Material Ready` | 14/14 |
| Main Days | `Main Closed − Main Created` | 177/177 |
| Rework Days | `Rework Closed − Rework Created` | 14/14 |
| Age Since SO (d) | `2026-08-11 − SO Submitted` | all |
| Days To Contractual (d) | `Contractual Date − 2026-08-11` | all |

**T2 is the commercially interesting one:** it measures *how long the customer took to approve drawings*. That is exactly the "NEEDS YOUR ACTION / drawing approval pending" signal on the dashboard mockup, and it is genuinely available.

**Important negative result:** `Contractual Date ≠ SO Submitted + Contractual Period` for 277 of 311 rows (only 34 match). These are **two independent stored fields**. Do not derive one from the other.

### Full column mapping (all 58)

Legend — **Safe**: `Y` = customer-safe, `N` = internal only, `D` = needs your decision, `Y*` = safe but only as a derived status, never the raw value.

| # | Excel column | What it means | Portal screen | Milestone / business rule | Likely ERPNext origin | Safe | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Sales Order | SO document id (`SO-22-00512`) | Projects, Project detail header | Root key for everything | `Sales Order.name` | Y | Customer's own order reference |
| 2 | Project | `code-yy-name`, often Arabic | Project title, Dashboard card | Display name | `Project.name` / `project_name` | Y | Needs a display-name rule (PDF §8.6) |
| 3 | Customer | Customer legal name, mostly Arabic | — (implicit) | **Tenant key** | `Sales Order.customer` | Y | Own name only. Free text, no ID — see gaps |
| 4 | Project Manager | Internal employee display name | Dashboard card, Project header | — | `Project.project_manager` | **D** | Mockups show "PM: Maha K."; §2 forbids employee names. Conflict |
| 5 | Item Group | Internal product taxonomy (`SR-Basic`, `Copper Busbar`, `Tmax`) | — | Distinguishes manufactured vs component lines | `Item.item_group` | N | Reveals internal product/BOM structure |
| 6 | Item | Item code (`P-SEC24N3F1`, `1SDA066317R1`) | Item row | WO `production_item` | `Sales Order Item.item_code` | **D** | Finished-goods codes fine; `1SDA066317R1` is an **ABB supplier part number** — that leaks supplier data |
| 7 | Item Name | Human description (`P-SEC 24KV (0DC+3SC+1SF)-Indoor`) | Item row, timeline label | — | `Sales Order Item.item_name` | Y | The correct customer-facing label |
| 8 | On Hold | 0/1 — 63 rows across 14 projects | Project card badge | Suppress "delayed" badge? | SO status / custom flag | **D** | May be a *credit* hold — commercially sensitive |
| 9 | SO Qty | Ordered quantity | Item row | Denominator for progress | `Sales Order Item.qty` | Y | |
| 10 | Delivered Qty | Delivered quantity | Item row, "items delivered" tile | Stage 6 | `Sales Order Item.delivered_qty` | Y | **Always ~0 here** (backlog filter). Must not be rendered as "0 delivered" |
| 11 | Remaining Qty | `SO Qty − Delivered Qty` | Item row | — | computed | Y | Verified: reconciles on 480/480 rows |
| 12 | Backlog Amount | Value of the *remaining* qty | Finance (labelled honestly) | — | `Sales Order Item.amount` prorated | **D** | **Not contract value.** Dividing by qty reveals unit price |
| 13 | SO Submitted | SO submission date | Project header | Anchor for T1 and Age | `Sales Order.transaction_date` | Y | |
| 14 | Contractual Period (d) | Agreed lead-time in days (0–500; 46 rows = 0) | Project header | — | custom field on SO | Y | |
| 15 | Contractual Date | Contractual delivery date | Dashboard card, Project header | Delay/overdue calculation | `Sales Order.delivery_date` / custom | Y | **Missing on 169/480 rows (35%)** |
| 16 | Initial Approval RFDs | Count of type=Initial Approval RFDs | — | Stage 1 trigger | Request For Design | Y* | Count itself is internal |
| 17 | IA Created | First IA RFD creation date | — | Stage 1 internal start | `RFD.creation` | N | Internal prep time |
| 18 | IA Submitted | IA RFD submitted date | Item timeline | **Stage 1 "Sent for approval" actual** | `RFD.custom_submission_date` | Y | "Drawings sent to you on…" |
| 19 | Revision RFDs | Count of revisions (0–12) | — | Stage 1 revision loop | Request For Design | **D** | A "12 revisions" count invites disputes |
| 20 | Rev Created | First revision creation | — | Stage 1 | `RFD.creation` | N | |
| 21 | Rev Submitted | Revision submitted date | Item timeline | Stage 1 re-submission actual | `RFD.custom_submission_date` | Y | |
| 22 | Released RFDs | Count of type=Release RFDs | — | **Stage 1 "Approved" trigger** | Request For Design | Y* | |
| 23 | Rel Created | Release RFD creation ≈ approval received | Item timeline | End of T2 (customer turnaround) | `RFD.creation` | Y | |
| 24 | Rel Submitted | Release RFD submitted | Item timeline | **Stage 1 actual end** | `RFD.custom_approval_date` (proxy) | Y | |
| 25 | WOs | Total WO count on the line | — | Item has a production journey at all | count | N | |
| 26 | Work Order | WO id(s), **comma-joined** when >1 | — | Anchor of item tracking | `Work Order.name` | N | Internal doc id — expose an opaque id instead |
| 27 | WO Qty | Quantity on the WO | Item row | — | `Work Order.qty` | Y | |
| 28 | Produced Qty | Produced so far | Item row | Stage 3 progress | `Work Order.produced_qty` | Y | |
| 29 | Main WOs | Count of non-rework WOs | — | — | count | N | |
| 30 | Main WO Status | `Not Started` / `In Process` / `Completed` / `Closed` / comma-combined | Item stage chip | **Stage 3 driver**; also Stage 4 & 5 trigger | `Work Order.status` | Y* | `Closed` and `Disassembled` are **not in the PDF rule table** |
| 31 | Main Created | WO creation date | Item timeline | Stage 3 *creation*, not actual start | `Work Order.creation` | Y | ⚠ This is **not** `actual_start_date` |
| 32 | Main Material Status | `Available` / `Partially Available` / `Not Available` | Item stage chip | **Stage 2 driver** | `Work Order.material_status` | Y* | |
| 33 | Main Material Delivery Date | Planned material arrival | Timeline planned lane | **Stage 2 planned** | `Work Order.material_delivery_date` | Y | Present on 204/480 |
| 34 | Main Planned End Date | Planned manufacturing end | Timeline planned lane | **Stage 3 planned end** | `Work Order.planned_end_date` | Y | Present on 291/480 |
| 35 | Main Modified Material Delivery Date | Revised material date (58 rows) | — | Slippage evidence | custom field | **D** | Exposes internal re-planning |
| 36 | Main Material Ready | Material transfer completed | Timeline actual lane | **Stage 2 actual** | `custom_last_material_transfer_for_manufacture` | Y | |
| 37 | Main Closed | Manufacturing completion | Timeline actual lane | **Stage 3 actual end** + Stage 4 "FAT Invitation" trigger | `custom_manufacture_submission_date` | Y | |
| 38 | Main Days | `Main Closed − Main Created` | — | Internal cycle-time KPI | computed | N | Internal efficiency metric |
| 39 | Rework WOs | Count of rework WOs (26 rows) | Neutral chip only | Stage 4 rework branch | `Work Order.custom_reworked_work_order` | Y* | |
| 40 | Rework WO Status | incl. `Disassembled` | Neutral chip only | Rework In Progress / Done | `Work Order.status` | Y* | Only "final quality adjustments in progress" |
| 41 | Rework Created | Rework WO creation | — | Internal | `Work Order.creation` | N | Reveals rework timing/severity |
| 42 | Rework Material Status | Rework material state | — | Internal | `Work Order.material_status` | N | |
| 43 | Rework Material Delivery Date | 6 rows | — | Internal | custom | N | |
| 44 | Rework Planned End Date | 25 rows | — | Internal | `planned_end_date` | N | |
| 45 | Rework Modified Material Delivery Date | 1 row | — | Internal | custom | N | |
| 46 | Rework Material Ready | 23 rows | — | Internal | custom | N | |
| 47 | Rework Closed | 14 rows | Timeline actual (as generic completion) | Rework Done | custom | **D** | The *date* is arguably safe; the *label* must stay neutral |
| 48 | Rework Days | Rework cycle time | — | Internal KPI | computed | N | |
| 49 | T1 Drawings Submission (d) | SO → drawings submitted | — | Internal KPI | computed | N | Our own responsiveness |
| 50 | T2 Customer Approval (d) | Drawings submitted → approval | Dashboard "needs your action" | **Customer-blocked signal** | computed | Y | The customer's *own* turnaround. Range −47…524 d |
| 51 | T3 WO Release (d) | Release RFD created → submitted | — | Internal KPI | computed | N | |
| 52 | T4 Material (d) | Release → material ready | — | Internal KPI | computed | N | |
| 53 | T5 Manufacturing (d) | Material ready → WO closed | — | Internal KPI | computed | N | |
| 54 | T6 Rework Release (d) | WO closed → rework created | — | Internal KPI | computed | N | |
| 55 | T7 Rework Material (d) | Rework created → material ready | — | Internal KPI | computed | N | |
| 56 | T8 Rework Manufacturing (d) | Rework material → rework closed | — | Internal KPI | computed | N | |
| 57 | Age Since SO (d) | Days since SO, **as of 2026-08-11** | Project header | — | computed | Y | **Recompute live** — never ship the frozen value |
| 58 | Days To Contractual (d) | Days to contractual date, as of 2026-08-11 | Dashboard delay badge | Overdue detection | computed | Y | Same — recompute live |

### Naming and interpretation

No column is renamed without a stated reason. Three deliberate renames in the normalized model:

- `Main Created` → `workOrderCreatedOn` — **not** `actualStartDate`. ERPNext has a real `actual_start_date`; this column is `creation`. Calling it "actual start" would silently fabricate a manufacturing start date.
- `Main Closed` → `manufacturingCompletedOn` — matches `custom_manufacture_submission_date` in PDF §4.
- `Backlog Amount` → `openOrderValue` — it is the value of *undelivered* qty, not `grand_total`. Labelling it "contract value" would be wrong on any partially-delivered order.

### Data-quality findings

| Finding | Count | Impact |
|---|---|---|
| Rows with a Work Order but **no Released RFD** | 70 | Stage 1 cannot be shown as Approved even though production started |
| Material status `Available` but **no material-ready date** | 65 | Stage 2 has a status but no actual date |
| Work Order exists but **no planned end date** | 64 | Stage 3 planned lane is empty |
| `Contractual Date` missing | 169 (35%) | No delivery commitment to show, no delay calculation |
| `Contractual Period` = 0 | 46 | Same |
| Rows with **no drawing evidence at all** (no IA, no Release) | 62 | Stage 1 falls to "Under preparation" |
| `Initial Approval RFDs` blank (not 0) | 37 | All are component/spare-part lines (`Tmax`, `MCB`, `Copper Busbar`…) with **zero** Work Orders — these items have no production journey at all |
| Negative cycle times | T1 min −40, T2 min −47, T4 min −321, T8 min −32 | Submitted-before-created ordering errors upstream |
| `Main WO Status` combined values (`"Completed, Not Started"`) | 1 | Multi-WO rows aggregate statuses as text — needs a defined rollup rule |
| WO field holds multiple comma-joined ids | 28 | Same |
| Statuses not in the PDF rule table (`Closed`, `Disassembled`) | 2 | Rule table is incomplete |
| Customer names mixing Latin + Arabic | 15 of 107 | Display/sort/search complexity |
| Project name carrying an RTL control character (`‎`) | 1 | Must be sanitised before render |

---

## C. Coverage analysis

### ✅ Available in Excel — buildable truthfully today

| Capability | Evidence |
|---|---|
| Customer → project list | 107 customers, 152 projects, 1:1 with SO |
| Project header: SO no., project name, order date, contractual period | 100% populated |
| Contractual delivery date + days-to-contractual + late detection | 311/480 rows (65%) |
| Item list per project: code, name, qty, remaining qty, WO qty, produced qty | 100% |
| **Stage 1 — Drawings Approval** | Approved 311 · Sent for approval 130 · Under preparation 39 |
| **Stage 2 — Material Readiness** | Fully 273 · Partial 48 · Not available 34 · no-WO 125 |
| **Stage 3 — Manufacturing** | Completed 178 · In Progress 49 · Not Started 253 |
| Stage 2 planned date (material delivery) | 204/480 |
| Stage 3 planned end date | 291/480 |
| Stage 1/2/3 actual dates | IA submitted 304 · Rel submitted 304 · material ready 208 · mfg completed 177 |
| **"Awaiting your drawing approval"** action signal | T2 verified on 197 rows |
| On-hold flag | 63 rows / 14 projects |
| Open order value per line | 100% (currency unknown) |

### ⚠️ Partially available

| Capability | What we have | What is missing |
|---|---|---|
| **Item timeline planned lane** | Planned end for Stage 3 (61%), planned material date for Stage 2 (43%) | **No planned start date for any stage**, no drawing due date, no planned FAT date, no planned delivery date. The planned lane can only be drawn for ~2 of 7 stages, and only as end-points |
| **Manufacturing actual start** | `Main Created` = WO creation date | ERPNext `actual_start_date` is not exported. WO creation ≠ production start |
| **Stage 4 — FAT** | Rework signal on 26 rows; `Main Closed` implies "FAT Invitation" per PDF rule | **No Stock Entry data**, so FAT Success can never be shown. 151 rows would sit permanently at "FAT invitation" |
| **Stage 6 — Delivery** | `Delivered Qty` column exists | Backlog filter makes it ~0 everywhere; no Delivery Note, no delivery dates. Cannot be shown |
| **% complete** | Stage-weighted progress across stages 1–3 is honest | Any % that implies stages 4–7 would be fabricated |
| **Multi-WO items** | Comma-joined ids and combined statuses | No per-WO breakdown; rollup rule undefined |
| **Non-manufactured lines** (37 rows) | Item, qty, value | No RFD, no WO — the 7-stage tracker does not apply. Needs its own presentation |

### ❌ Not available — must **not** be faked

| PDF requirement | Status |
|---|---|
| **Stage 5 — Pre-Delivery Payment** | No payment data of any kind. 0/480 rows |
| **Stage 7 — Financial Clearance** | No invoice data of any kind. 0/480 rows |
| Contract value (`grand_total`) | Absent. `Backlog Amount` is open value, not contract value |
| **Currency** | **Absent entirely.** PDF §5 mandates "always display document currency". We cannot honour that — so no amount should carry a currency symbol |
| Customer PO number (`po_no`) | Absent — shown in both mockups |
| Cubicle count (`cubicle_nos`) | Absent — shown in the Project-detail mockup |
| Invoices, due dates, outstanding, overdue, aging buckets | Absent |
| Payments, payment methods, allocations | Absent |
| Payment schedule / payment terms | Absent |
| Advance received | Absent |
| Statement of account | Absent |
| **Documents module** (FAT reports, delivery notes, invoice PDFs) | Absent — no File/attachment data |
| Contacts, emails, logins, admin-contact flag | Absent — no identity data at all |
| Notifications | Absent (needs both events and contacts) |
| Stable customer ID | Absent — only free-text names |
| Stable order-line ID | Absent — `(SO, Item)` collides on 4 groups |

### Honest headline

**3 of 7 stages** are fully derivable. **1** is partial. **3** are not derivable at all. **Zero** of the Finance module and **zero** of the Documents module can be built from this file.

### The honesty rule (non-negotiable)

Anywhere data is absent, the UI states *"Not available in the current data source"* and names the source. It never renders `0`, `Not paid`, `Not delivered`, or an empty progress bar, because each of those is a **false factual claim** about a real customer's real order. This is enforced structurally by the `Maybe<T>` type in §D — a missing value is not representable as a zero.

---

## D. Proposed normalized data model

Provider-agnostic, ERPNext-shaped, TypeScript. Excel and ERPNext both map *into* this; nothing above this layer knows where data came from.

### The availability primitive

```ts
export type Unknown = {
  state: 'unknown'
  reason: 'not_in_source' | 'not_applicable' | 'pending' | 'restricted'
  sourceNote?: string          // e.g. "Excel backlog export has no invoice data"
}
export type Known<T> = { state: 'known'; value: T }
export type Maybe<T> = Known<T> | Unknown
```

Every optionally-sourced field is `Maybe<T>`, never `T | null`. The compiler then makes it impossible to render an unknown as a zero, and the UI is forced to handle the unknown branch explicitly. This is the mechanism that implements "do not fabricate missing backend information".

### Core entities

```ts
// ── Tenant ────────────────────────────────────────────────
interface Customer {
  id: CustomerId              // opaque, stable, never the raw name
  erpCustomerId: Maybe<string>// ERPNext Customer.name — unknown in Excel
  displayName: LocalizedText  // { en?, ar?, raw }
}
interface PortalContact {
  id: ContactId
  customerId: CustomerId
  email: string
  displayName: string
  permissions: { viewProgress: boolean; viewFinance: boolean }  // admin-contact flag
  locale: 'en' | 'ar'
}

// ── Commercial ────────────────────────────────────────────
interface Project {                    // = Sales Order (1:1 confirmed in data)
  id: ProjectId
  customerId: CustomerId
  salesOrderNo: string
  projectCode: Maybe<string>
  displayName: LocalizedText
  customerPoNo: Maybe<string>          // unknown in Excel
  contractValue: Maybe<Money>          // unknown in Excel
  openOrderValue: Maybe<Money>         // Backlog Amount — NOT contract value
  currency: Maybe<CurrencyCode>        // unknown in Excel
  orderedOn: Maybe<Date>
  contractualPeriodDays: Maybe<number>
  contractualDate: Maybe<Date>
  projectManager: Maybe<{ displayName: string }>   // name only, never email
  onHold: Maybe<boolean>
  lines: OrderLine[]
}
interface OrderLine {
  id: OrderLineId                      // provider-stable synthetic key
  projectId: ProjectId
  itemCode: Maybe<string>              // whitelisted by item class
  itemName: string
  itemClass: 'manufactured' | 'supplied_component' | 'unknown'
  quantity: { ordered: number; delivered: Maybe<number>; remaining: Maybe<number> }
  lineValue: Maybe<Money>
  production: ProductionRecord | null  // null ⇒ no 7-stage journey applies
  timeline: ItemTimeline
}

// ── Production ────────────────────────────────────────────
interface ProductionRecord {
  workOrderRefs: OpaqueRef[]           // internal ids never leave the BFF
  workOrderCount: number
  main: WorkOrderRollup
  rework: ReworkSummary | null
  drawings: DrawingRecord
}
interface WorkOrderRollup {
  status: Maybe<'not_started' | 'in_process' | 'completed' | 'closed' | 'mixed'>
  materialStatus: Maybe<'not_available' | 'partially_available' | 'available'>
  createdOn: Maybe<Date>               // WO creation — NOT actual start
  actualStartOn: Maybe<Date>           // unknown in Excel
  plannedStartOn: Maybe<Date>          // unknown in Excel
  plannedEndOn: Maybe<Date>
  materialPlannedOn: Maybe<Date>
  materialReadyOn: Maybe<Date>
  manufacturingCompletedOn: Maybe<Date>
  quantity: { ordered: Maybe<number>; produced: Maybe<number> }
}
interface ReworkSummary { inProgress: boolean; completedOn: Maybe<Date> }  // neutral only
interface DrawingRecord {
  initialSubmittedOn: Maybe<Date>
  revisionSubmittedOn: Maybe<Date>
  approvalReceivedOn: Maybe<Date>      // Rel Created
  releasedOn: Maybe<Date>              // Rel Submitted
  hasRelease: Maybe<boolean>
  awaitingCustomerSinceDays: Maybe<number>   // from T2 — customer's own turnaround
}

// ── Milestones (computed, never stored) ───────────────────
type StageId = 1|2|3|4|5|6|7
interface Milestone {
  stage: StageId
  status: Maybe<MilestoneStatus>       // unknown ⇒ "not available in this source"
  plannedStart: Maybe<Date>
  plannedEnd: Maybe<Date>
  actualStart: Maybe<Date>
  actualEnd: Maybe<Date>
  varianceDays: Maybe<number>
  evidence: EvidenceRef[]              // which doc drove it — audit, internal
}
interface ItemTimeline {
  milestones: Record<StageId, Milestone>
  currentStage: Maybe<StageId>
  nextMilestone: Maybe<{ stage: StageId; plannedOn: Maybe<Date> }>
  progressPercent: Maybe<number>
  progressBasis: StageId[]             // WHICH stages the % covers — shown in UI
  blockedOnCustomer: Maybe<{ reason: 'drawing_approval'; sinceDays: Maybe<number> }>
}

// ── Finance & Documents (fully Maybe today) ───────────────
interface FinanceSummary {
  contractTotal: Maybe<Money>; invoiced: Maybe<Money>; paid: Maybe<Money>
  outstanding: Maybe<Money>; overdue: Maybe<Money>
  aging: Maybe<{ d0_30: Money; d31_60: Money; d61_90: Money; d90plus: Money }>
}
interface Invoice { id; number; projectId; postingDate; dueDate; total: Money;
  outstanding: Money; status; pdf: Maybe<DocumentRef> }
interface Payment { id; postingDate; amount: Money; method: Maybe<string>;
  allocatedTo: Array<{ kind: 'invoice'|'order'; ref: string }> }
interface PaymentTerm { label; percent; amount: Money; dueDate: Maybe<Date>;
  status: 'paid'|'upcoming'|'not_due'|'overdue' }
interface DocumentRef { id; kind: 'fat_report'|'delivery_note'|'invoice'|'statement';
  title; issuedOn: Maybe<Date>; sizeBytes: Maybe<number> }   // download via BFF only

// ── Source transparency ───────────────────────────────────
interface DataSourceInfo {
  providerId: 'excel-backlog' | 'erpnext'
  label: LocalizedText
  asOf: Date                     // 2026-08-11 for this export
  isLive: boolean                // false for Excel
  scopeCaveat: Maybe<string>     // "Open backlog only — delivered lines excluded"
}
```

Every screen payload carries `DataSourceInfo`, so the UI can always tell the customer how fresh the data is and what it excludes. That single field is what makes an Excel-backed portal honest.

---

## E. Data-source architecture

### The port

```ts
export interface PortalDataProvider {
  readonly id: string
  capabilities(): ProviderCapabilities
  sourceInfo(): Promise<DataSourceInfo>

  resolveCustomerForContact(email: string): Promise<Customer | null>
  getCustomer(id: CustomerId): Promise<Customer | null>

  // Every method takes CustomerId as its FIRST argument. There is no
  // signature in this interface capable of returning cross-tenant data.
  listProjects(customerId: CustomerId, q?: ProjectQuery): Promise<Project[]>
  getProject(customerId: CustomerId, projectId: ProjectId): Promise<Project | null>
  getOrderLines(customerId: CustomerId, projectId: ProjectId): Promise<OrderLine[]>

  getFinanceSummary(customerId: CustomerId, scope?: ProjectId): Promise<Maybe<FinanceSummary>>
  listInvoices(customerId: CustomerId, scope?: ProjectId): Promise<Maybe<Invoice[]>>
  listPayments(customerId: CustomerId, scope?: ProjectId): Promise<Maybe<Payment[]>>
  getPaymentSchedule(customerId: CustomerId, projectId: ProjectId): Promise<Maybe<PaymentTerm[]>>
  listDocuments(customerId: CustomerId, q?: DocumentQuery): Promise<Maybe<DocumentRef[]>>
  openDocument(customerId: CustomerId, documentId: string): Promise<DocumentStream | null>
}

export interface ProviderCapabilities {
  finance: false | { invoices: boolean; payments: boolean; schedule: boolean; aging: boolean }
  documents: boolean
  fatEvents: boolean
  deliveryEvents: boolean
  plannedDates: { drawings: boolean; material: boolean; manufacturingStart: boolean;
                  manufacturingEnd: boolean; fat: boolean; delivery: boolean }
  currency: boolean
  liveUpdates: boolean
  scope: 'full_order_book' | 'open_backlog_only'
}
```

`capabilities()` is what the UI reads to decide whether to render a screen, a "not available" panel, or hide a nav item — **not** `try/catch` or empty arrays. The Excel provider declares `finance: false`, `documents: false`, `scope: 'open_backlog_only'`, so the Finance page renders an honest explanation on day one and becomes fully functional the day the ERPNext provider flips those flags. **No UI code changes.**

### Implementations

| | `ExcelBacklogProvider` (now) | `ErpNextApiProvider` (later) |
|---|---|---|
| Source | Local `.xlsx`, gitignored | ERPNext REST + whitelisted server methods |
| Load | Parsed **once at boot** into an indexed in-memory snapshot (`Map<CustomerId, Project[]>`), never per request | Bulk queries per tenant, composed server-side |
| Latency | microseconds | network-bound → cached |
| Capabilities | 3 stages, no finance, no docs | all 7 stages, full finance, docs |
| Tenant key | `sha256(normalizedCustomerName)[0:16]` | ERPNext `Customer.name` |

A third `FixtureProvider` (synthetic, committed) backs the test suite so **no real company data ever enters Git**.

### Composition and layering

```
                        ┌──────────────────────────────────┐
  Browser ──HTTPS──►    │  Next.js  (App Router, RSC)      │
                        │   UI ──► composed screen DTO     │
                        ├──────────────────────────────────┤
                        │  BFF route handlers (thin)       │
                        │   auth ▸ tenant resolve ▸ DTO map│
                        ├──────────────────────────────────┤
                        │  Application: read-model composer│
                        │   Dashboard / ProjectDetail / …  │
                        ├──────────────────────────────────┤
                        │  Domain (pure): 7-stage engine,  │
                        │   progress, delay, finance calc  │
                        ├──────────────────────────────────┤
                        │  PortalDataProvider  (port)      │
                        └───────┬──────────────────┬───────┘
                                │                  │
                    ExcelBacklogProvider    ErpNextApiProvider
                          (today)          (later)  ──► ERPNext
```

The browser only ever calls the portal's own composed endpoints. It never orchestrates, never sees ERPNext, never holds a credential.

---

## F. Performance & caching design

Performance is treated as a hard requirement, designed in from the first commit — not retrofitted.

### Cache topology

| Layer | Scope | TTL | Purpose |
|---|---|---|---|
| **L0** request memo | one request | request | Dedupes repeated reads inside one render pass |
| **L1** in-process LRU | one instance | 10–30 s | Absorbs bursts; free |
| **L2** Redis (Upstash) | global | see below | The real cache — survives cold starts |

Two distinct kinds of L2 entry:

1. **Raw source cache** — per tenant, per doctype (`sales_orders`, `work_orders`, …). TTL 5 min. Lets many screens share one fetch.
2. **Read-model cache** — the *composed, already-whitelisted* screen payload (`dashboard`, `project:{id}`). Fresh 90 s, then **stale-while-revalidate** up to 15 min. This is what makes cached responses feel instant: one Redis `GET` and a JSON parse, no composition, no ERPNext.

### Key scheme — tenant isolation by construction

```
portal:s{SCHEMA_VER}:t:{tenantId}:g:{tenantGen}:rm:dashboard
```

- `tenantId` is **always** derived from the JWT server-side, never from a request parameter.
- `tenantGen` is a per-tenant generation counter. A webhook does `INCR gen:{tenantId}` and every cached entry for that tenant is instantly unreachable — O(1) invalidation, no `SCAN`, no key enumeration, no risk of a partial flush leaving a stale mixed state.
- `SCHEMA_VER` is bumped whenever a DTO or business rule changes → global invalidation on deploy, so a code change can never serve a payload shaped by the old rules.
- Keys are built **only** through a typed `cacheKey(tenant, …)` builder. A lint rule plus a unit test forbid raw string keys, so a tenant-less key cannot be written by accident. A test asserts that every key emitted during a full screen crawl contains the tenant segment.

### Invalidation

- **Primary — webhooks.** ERPNext webhooks on submit/update of Sales Order, Work Order, Request For Design, Stock Entry, Delivery Note, Sales Invoice and Payment Entry POST to `/api/webhooks/erpnext` with an HMAC signature. The handler resolves the affected customer and increments that tenant's generation. Nothing else.
- **Fallback — short TTL**, as above, so a missed webhook degrades freshness by minutes rather than breaking correctness.
- **Webhook health watchdog:** if no webhook has arrived within N minutes, the system automatically drops to short-TTL mode and raises an alert — a silently dead webhook must never turn into silently stale data.

### Avoiding N+1

A hard architectural rule: **a request may issue O(number of doctypes) ERPNext calls, never O(number of items).**

- Bulk list queries with `IN` filters on parent ids, chunked at 50–100 ids, `limit_page_length=0`.
- Joining happens in memory in the composer, not by looping calls.
- For the two expensive screens, prefer the PDF's own recommendation (§9): 2–3 **whitelisted Frappe server methods** in a small custom app returning one composed JSON per screen.
- Child tables are read via the parent document — the PDF warns that direct child-table list access returns 403 for restricted users.
- **Enforced by test**, not by discipline: a request-scoped counter asserts the whole project-detail screen for the 27-line project stays within a fixed call budget. The test fails if anyone reintroduces a per-item call.

Target: a cold dashboard = **≤ 8 bulk calls**; a warm dashboard = **0**.

### Stampede protection

Single-flight per key: a local in-flight promise map plus a Redis `SET NX PX` lock, so a cache expiry under load produces one upstream fetch, not hundreds. SWR revalidation runs in the background via `waitUntil` — the customer is never made to wait for a refresh.

### Instrumentation

A `RequestMetrics` object in `AsyncLocalStorage` records, for every request: `route`, hashed `tenantId`, `providerCalls`, `providerMs`, `cache.{hit,miss,stale}`, `composeMs`, `totalMs`, `payloadBytes`. Emitted as one structured log line, plus a `Server-Timing` header in non-production. The provider decorator `withMetrics(provider)` wraps *any* provider — so call counts are measurable against the Excel provider today, and the ERPNext call budget is already instrumented before the API exists.

**Budgets** (asserted in CI): warm dashboard p95 < 150 ms server time · warm project detail p95 < 200 ms · cold dashboard p95 < 1.2 s · page load < 2 s on 4G, which is the PDF's own go-live gate.

---

## G. Security design

| Requirement | How it is met |
|---|---|
| Tenant isolation | `CustomerId` is resolved server-side from the session and is the mandatory first parameter of every provider method. No endpoint accepts a customer identifier from the client. Cache keys are tenant-scoped by construction |
| IDOR proof | Automated test suite: for every endpoint, a session for customer A requesting every id belonging to customer B must return 404 (not 403 — a 403 confirms the id exists) |
| Field whitelisting | Customer-facing DTOs are hand-written and validated by a Zod schema in `.strict()` mode. A **contract test** deep-scans every serialized response for blacklisted keys (`*cost*`, `*margin*`, `rate`, `bom*`, `supplier*`, `warehouse*`, `rework_reason`, `rework_comment`, `*email*`) and fails the build on a hit. Domain entities never cross the wire |
| Internal ids | Work Order numbers, ERPNext doc names and internal cycle-time KPIs (T1, T3–T8, Main Days) are not in any DTO. Items are addressed by opaque ids |
| Rework | Only a neutral boolean reaches the DTO. Reasons, comments, counts and rework dates stay in the domain layer |
| Credentials | ERPNext key/secret are server-only env vars, never in a `NEXT_PUBLIC_*` var, never in a client component, never in a RSC payload. A CI check greps the client bundle for the token prefix |
| Attachments | Streamed through the BFF after a tenant check, behind short-lived signed URLs. No ERPNext private file URL is ever emitted |
| Real data in Git | The `.xlsx`, any generated snapshot, and any `.env` are gitignored from the first commit, before the file is ever placed in the repo. Tests run on synthetic fixtures only. A pre-commit hook blocks `*.xlsx` |
| Standard | HTTPS, argon2 password hashing, rate limiting, account lockout, audit log of every customer request, OWASP Top-10 review, pen test as launch gate |

---

## H. UX plan

Direction follows the mockups — dark header with the orange POWERLINE wordmark, light neutral canvas, generous white space, orange for progress/primary and a restrained green/amber/red only for genuine status meaning.

**Improvements on the mockups**

- The dual-lane bar is dense. Add a stage legend that stays visible on scroll, and make the "Today" line and the delay hatch usable without hover (hover-only information is inaccessible on touch and to keyboard users).
- Stage colour is a 7-step monochrome orange ramp in the mockups; segments 5–7 are hard to distinguish. Introduce a hue shift or explicit segment labels, and never rely on colour alone.
- On mobile, the time-scaled bar does not work below ~700 px. Fall back to a **vertical stage stepper** per item with the same planned/actual/variance content.
- Tooltips become tap-to-open popovers on touch.

**Bilingual / RTL**

- `next-intl` with `[locale]` routing; `dir="rtl"` on the document for Arabic; CSS logical properties throughout (`margin-inline-start`, never `margin-left`) so RTL is a data attribute, not a second stylesheet.
- The timeline axis mirrors under RTL — time still runs start→end in reading order.
- Latin numerals and Gregorian dates in both locales unless you specify otherwise (invoice/PO references must stay copy-pasteable).
- Customer and project names are Arabic free text: sanitise the stray RTL control characters found in the data, and isolate with `<bdi>` so mixed Latin/Arabic names (15 of 107 customers) do not scramble surrounding layout.

**Honest empty states** — the core UX decision of this phase. Where the source lacks data, the screen shows a titled panel: *"Financial data is not available in the current data source"* + a plain-language explanation + *"Data source: PM backlog export, as of 11 Aug 2026"*. Never a zero, never an empty progress bar, never a grey "—" that could read as "nothing owed". Every screen carries a persistent data-source banner while the Excel provider is active.

---

## I. Recommended project structure

**Framework: Next.js 15 (App Router) + TypeScript + Tailwind, deployed on Vercel** — this is the PDF's own decision (§3), it collapses frontend and BFF into one deployable, and React Server Components let the composed read model be rendered server-side without a client round-trip.

```
src/
  domain/                    # PURE. no I/O, no framework, 100% unit-testable
    model/                   # entities, Maybe<T>, Money, LocalizedText
    milestones/              # the 7-stage rule engine — one file per stage
    progress/                # % complete, next milestone, delay, blocked-on-customer
    finance/                 # outstanding, overdue, aging
  ports/                     # PortalDataProvider, CacheStore, Clock, Logger, Metrics
  providers/
    excel/                   # loader, column-map (single source of column truth), adapter
    erpnext/                 # client, bulk fetchers, field whitelists, adapter
    fixture/                 # synthetic data for tests — safe to commit
    withMetrics.ts           # instrumentation decorator, provider-agnostic
    index.ts                 # factory: PORTAL_DATA_PROVIDER env switch
  application/               # read-model composers, one per screen
  dto/                       # customer-facing DTOs + Zod schemas + blacklist test
  infra/
    cache/                   # RedisCache, MemoryCache, key builder, single-flight, SWR
    auth/  metrics/  i18n/
app/
  [locale]/(portal)/dashboard | projects | projects/[id] | finance | documents
  api/                       # BFF routes + /api/webhooks/erpnext
tests/
  domain/                    # table-driven 7-stage rules, straight from PDF §4
  providers/                 # adapter tests on fixtures
  security/                  # IDOR matrix + DTO field-leak contract test
  performance/               # provider-call-budget assertions
data/                        # GITIGNORED — the real .xlsx lives here
```

**Dependency rule:** `domain` imports nothing. `application` imports `domain` + `ports`. `providers` import `ports` + `domain`. `app/` imports `application` + `dto`. Enforced by an ESLint boundary rule so the Excel dependency cannot leak upward by accident.

---

## J. Proposed implementation plan

| Milestone | Content | Exit criteria |
|---|---|---|
| **M0 — Skeleton & safety** | Next.js + TS + Tailwind scaffold, `.gitignore` for `data/` and `.env` **first**, ESLint boundary rules, CI | Real `.xlsx` cannot be committed. Layer violations fail the build |
| **M1 — Domain core** | `Maybe<T>`, entities, the 7-stage rule engine, progress/delay, table-driven tests transcribed from PDF §4 | Every rule in §4 has a passing test, including "unknown" branches. Zero I/O in `domain/` |
| **M2 — Excel provider** | Column map, adapter, boot-time indexed snapshot, tenant-key derivation, capability declaration | 480 rows load; stage distribution matches this report exactly; provider tests run on fixtures only |
| **M3 — Read models + cache + metrics** | Dashboard and project-detail composers, cache abstraction with tenant-scoped keys, single-flight, SWR, `RequestMetrics` | Call-budget and cache-key-isolation tests pass against the Excel provider |
| **M4 — UI** | Login (dev identity), Dashboard, Projects, Project detail, Item timeline (desktop bar + mobile stepper), EN/AR + RTL, honest empty states for Finance and Documents | Both locales render; no fabricated value on any screen; mobile timeline usable |
| **M5 — Security gate** | IDOR matrix, DTO blacklist contract test, audit log, rate limiting | Customer A cannot reach customer B on any endpoint; no blacklisted field in any response |
| **M6 — ERPNext provider** *(when API access exists)* | `ErpNextApiProvider` against the same port, bulk fetchers, webhook invalidation, whitelisted server methods | Provider swap by env var only. **Zero changes** in `domain/`, `application/`, `dto/`, `app/`. Stages 4–7 and Finance light up because capabilities flip to true |

M6 is the whole point of the architecture: the work in M1–M5 is not thrown away, and the ERPNext switch-on is a provider implementation plus a config change.

---

## K. Decisions I need from you

These genuinely change the build. I have not guessed at any of them.

1. **Customer identity.** The export has no customer ID — only free-text names, 15 of which mix Latin and Arabic. I plan to derive a stable key by hashing the normalized name. Can you get me an export with the ERPNext `Customer.name` (the actual link ID)? Without it, a renamed customer in ERPNext becomes a *different tenant* in the portal — which is a correctness and isolation risk, not just cosmetics.

2. **Project Manager name — a direct conflict in the spec.** §2 says never expose employee names; §6.3 and both mockups show "PM: Maha K." My reading is that the intent is *no employee emails*, and a PM display name is deliberate. Confirm: show PM name, or hide it?

3. **`Backlog Amount`.** It is the value of *undelivered* quantity, not contract value, and dividing by quantity reveals unit price. It is the customer's own price, so it is arguably safe — but it is the only money figure we have, and labelling it "contract value" would be false. Options: (a) show as "Open order value", (b) hide all money until ERPNext. My recommendation: **(b)** — one wrong-looking number on a finance screen costs more trust than an empty one, and there is no currency in the file to label it with anyway.

4. **`On Hold` (63 rows, 14 projects).** Does this mean a commercial/credit hold? If so it must not be exposed as-is. Should it be hidden, or shown as a neutral "on hold — please contact your account manager"?

5. **Component and spare-part lines.** 37 rows are loose components (`Tmax`, `MCB`, `Copper Busbar`, ABB part numbers like `1SDA066317R1`) with no RFD and no Work Order — for example the project "087-26-Spare Parts - 500 MW". The 7-stage tracker does not apply to them, and exposing supplier part numbers arguably leaks supplier data. Show them as a simple ordered-quantity list without a tracker, or exclude them?

6. **Revision count.** 148 rows have 1 revision, one has 12. Showing "12 revisions" is a claim about who caused delay. Show the count, or only the current drawing status?

7. **Can you export three more sheets before ERPNext API access?** Sales Invoice, Payment Entry and Delivery Note extracts (filtered the same way) would let me build Finance, Documents and stages 5–7 for real instead of leaving three screens empty. This is by far the highest-value thing you could give me next.

8. **Is the "open backlog" filter confirmed?** I inferred it from `Delivered Qty` being 0 on 469 of 480 rows. If a full order book export is available instead, project completion percentages become truthful.

9. **Login for the Excel phase.** There is no contact/email data. For the prototype, do you want (a) a small seeded credential list kept outside Git, or (b) an internal-only customer switcher with no auth, with real auth built in M6? Recommendation: **(a)**, so the tenant-isolation tests are exercising the real code path from day one.

10. **Project display name.** Names are `code-yy-name`, often Arabic, one carrying a stray RTL control character. PDF §8.6 leaves this open. Confirm the customer-facing format — my suggestion is *SO number + customer PO + short name*, but the PO is not in this export.

---

## Summary in one paragraph

The PDF is a well-specified, ERPNext-anchored read-only portal whose defining rule is that no status is ever typed by a human. The Excel file is an *internal cycle-time report filtered to open backlog*, not a customer extract — it supports **3 of the 7 stages fully, 1 partially, and 3 not at all**, and contains **no finance, no documents, no contacts and no currency**. That is enough to build and prove the entire architecture — domain rules, provider port, tenant isolation, caching, instrumentation and most of the UI — provided the missing areas are represented honestly rather than as zeros. The `Maybe<T>` type and the provider `capabilities()` descriptor are the two mechanisms that make that honesty structural rather than a matter of discipline, and they are also what lets the ERPNext provider light up Finance, Documents and stages 4–7 later **without touching the domain, the application layer, the DTOs or the UI**.

---

*Phase 1 discovery complete. No application code written. Awaiting approval before implementation.*
