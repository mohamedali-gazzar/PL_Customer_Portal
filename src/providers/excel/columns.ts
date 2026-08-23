/**
 * The single source of truth for the shape of the two PM Phase Cycle Times exports.
 *
 * `COLUMNS` is the portal's whole column vocabulary — the union of both reports.
 * `OPEN_KEYS` and `DELIVERED_KEYS` say which of them each report actually supplies.
 * A key a report does not supply reads as `null` on every row of that report, which
 * is the honest answer: the column is absent, not empty.
 *
 * The loader validates the real header against the shape's key list and refuses to
 * run on a missing column. A silently renamed or reordered column would otherwise
 * produce a portal full of blank milestones that looks like "nothing has happened" —
 * the exact failure this codebase is built to prevent. Loud failure is the point.
 *
 * Header names are transcribed verbatim from the 22 August 2026 exports, sheet
 * "Query Report": Open Backlog 109 columns, Delivered 59.
 */

export const SHEET_NAME = 'Query Report'

export const COLUMNS = {
  // ── identity ────────────────────────────────────────────────────────────────
  salesOrder: 'Sales Order',
  project: 'Project',
  customer: 'Customer',
  projectManager: 'Project Manager',
  itemGroup: 'Item Group',
  item: 'Item',
  itemName: 'Item Name',
  onHold: 'On Hold',

  // ── quantities and money ────────────────────────────────────────────────────
  soQty: 'SO Qty',
  deliveredQty: 'Delivered Qty',
  remainingQty: 'Remaining Qty',
  backlogAmount: 'Backlog Amount',
  /** Delivered only. A shipped line has no backlog, so it reports what it earned. */
  deliveredAmount: 'Delivered Amount',

  soCreatedOn: 'SO Created On',
  soSubmitted: 'SO Submitted',
  contractualPeriodDays: 'Contractual Period (d)',
  contractualDate: 'Contractual Date',

  // ── drawings ────────────────────────────────────────────────────────────────
  initialApprovalRfds: 'Initial Approval RFDs',
  iaCreated: 'IA Created',
  iaSubmitted: 'IA Submitted',
  revisionRfds: 'Revision RFDs',
  revCreated: 'Rev Created',
  revSubmitted: 'Rev Submitted',
  releasedRfds: 'Released RFDs',
  relCreated: 'Rel Created',
  relSubmitted: 'Rel Submitted',
  /** Open only. Milestone 3 completes on this — the customer's own approval. */
  relApproved: 'Rel Approved',

  // ── work orders ─────────────────────────────────────────────────────────────
  woCount: 'WOs',
  workOrder: 'Work Order',
  woQty: 'WO Qty',
  producedQty: 'Produced Qty',

  mainWoCount: 'Main WOs',
  mainWoStatus: 'Main WO Status',
  mainCreated: 'Main Created',
  mainWoSubmittedOn: 'Main WO Submitted On',
  mainMaterialStatus: 'Main Material Status',
  mainNotAvailableOn: 'Main Not Available On',
  mainPartiallyAvailableOn: 'Main Partially Available On',
  mainAvailableOn: 'Main Available On',
  mainMaterialDeliveryDate: 'Main Material Delivery Date',
  mainPlannedEndDate: 'Main Planned End Date',
  mainModifiedMaterialDeliveryDate: 'Main Modified Material Delivery Date',
  mainMaterialReady: 'Main Material Ready',
  mainClosed: 'Main Closed',
  mainProductionStarted: 'Main Production Started',
  mainFatSuccess: 'Main FAT Success',
  mainTestingStartedOn: 'Main Testing Started On',
  mainTestingTouchupOn: 'Main Testing Touchup On',
  mainTestingCompletedOn: 'Main Testing Completed On',
  mainDays: 'Main Days',

  // ── rework ──────────────────────────────────────────────────────────────────
  reworkWoCount: 'Rework WOs',
  reworkWoStatus: 'Rework WO Status',
  reworkCreated: 'Rework Created',
  reworkMaterialStatus: 'Rework Material Status',
  reworkMaterialDeliveryDate: 'Rework Material Delivery Date',
  reworkPlannedEndDate: 'Rework Planned End Date',
  reworkModifiedMaterialDeliveryDate: 'Rework Modified Material Delivery Date',
  reworkMaterialReady: 'Rework Material Ready',
  reworkClosed: 'Rework Closed',
  reworkTestingTouchupOn: 'Rework Testing Touchup On',
  reworkTestingCompletedOn: 'Rework Testing Completed On',
  reworkDays: 'Rework Days',

  // ── delivery ────────────────────────────────────────────────────────────────
  deliveryNotes: 'Delivery Notes',
  dnWorkflowState: 'DN Workflow State',
  dnCreatedOn: 'DN Created On',
  deliveredOn: 'Delivered On',
  dnQty: 'DN Qty',
  /** Delivered only, and the same fact as `deliveredOn` under a shorter header. */
  deliveredDate: 'Delivered',

  // ── cycle times ─────────────────────────────────────────────────────────────
  // T9 and T10 are deliberately absent: the two reports use those numbers for
  // different phases — "T9 Main Testing" against "T9 Delivery" — and mapping both
  // to one key would silently blend them. The timeline draws T1–T8.
  t1DrawingsSubmission: 'T1 Drawings Submission (d)',
  t2CustomerApproval: 'T2 Customer Approval (d)',
  t3WoRelease: 'T3 WO Release (d)',
  t4Material: 'T4 Material (d)',
  t5Manufacturing: 'T5 Manufacturing (d)',
  t6ReworkRelease: 'T6 Rework Release (d)',
  t7ReworkMaterial: 'T7 Rework Material (d)',
  t8ReworkManufacturing: 'T8 Rework Manufacturing (d)',

  // ── the report's own verdict ────────────────────────────────────────────────
  // Section 6: this rule lives in SQL, owned by the ERP team. The portal reads it
  // rather than keeping a second copy that would drift.
  ageSinceSo: 'Age Since SO (d)',
  daysToContractual: 'Days To Contractual (d)',
  stepCode: 'Step Code',
  stageSince: 'Stage Since',
  currentStageNo: 'Current Stage #',
  currentStage: 'Current Stage',
  currentStepNo: 'Current Step #',
  currentStep: 'Current Step',
  daysInCurrentStage: 'Days In Current Stage',
} as const

export type ColumnKey = keyof typeof COLUMNS
export const COLUMN_KEYS = Object.keys(COLUMNS) as ColumnKey[]

/** Everything the Open Backlog export supplies — every key but the two Delivered-only ones. */
export const OPEN_KEYS: readonly ColumnKey[] = COLUMN_KEYS.filter(
  (k) => k !== 'deliveredAmount' && k !== 'deliveredDate',
)

/**
 * What the Delivered export supplies.
 *
 * Materially shorter than the model document claims — see docs/SPEC-AUDIT.md §3.1.
 * The missing columns are the ones that would complete milestones 3, 4, 5, 8, 9 and
 * 11, plus the whole `current_*` family. Nothing is substituted for them: those
 * milestones report "Not recorded", and the headline stage comes from the report's
 * own definition, that a row in this file is delivered by construction.
 */
export const DELIVERED_KEYS: readonly ColumnKey[] = [
  'salesOrder', 'project', 'customer', 'projectManager', 'itemGroup', 'item', 'itemName', 'onHold',
  'soQty', 'deliveredQty', 'deliveredAmount',
  'soSubmitted', 'contractualPeriodDays', 'contractualDate',
  'initialApprovalRfds', 'iaCreated', 'iaSubmitted',
  'revisionRfds', 'revCreated', 'revSubmitted',
  'releasedRfds', 'relCreated', 'relSubmitted',
  'woCount', 'workOrder', 'woQty', 'producedQty',
  'mainWoCount', 'mainWoStatus', 'mainCreated', 'mainMaterialStatus',
  'mainMaterialDeliveryDate', 'mainPlannedEndDate', 'mainModifiedMaterialDeliveryDate',
  'mainMaterialReady', 'mainClosed', 'mainDays',
  'reworkWoCount', 'reworkWoStatus', 'reworkCreated', 'reworkMaterialStatus',
  'reworkMaterialDeliveryDate', 'reworkPlannedEndDate', 'reworkModifiedMaterialDeliveryDate',
  'reworkMaterialReady', 'reworkClosed', 'reworkDays',
  'deliveredDate',
  't1DrawingsSubmission', 't2CustomerApproval', 't3WoRelease', 't4Material',
  't5Manufacturing', 't6ReworkRelease', 't7ReworkMaterial', 't8ReworkManufacturing',
]

export interface ReportShape {
  readonly name: 'open' | 'delivered'
  readonly keys: readonly ColumnKey[]
}

export const OPEN_SHAPE: ReportShape = { name: 'open', keys: OPEN_KEYS }
export const DELIVERED_SHAPE: ReportShape = { name: 'delivered', keys: DELIVERED_KEYS }

/**
 * Delivery Note workflow states that mean accounts have released the shipment.
 * Anything else — including `Draft` — is still pending. Spec, Delta 2.
 */
export const DN_APPROVED_STATES: readonly string[] = [
  'Approved',
  'Approved by Accounts',
  'Approved by Accounts Manager',
  'Approved By Accounts User',
  'Approved by Deliveries',
]

export function isDnApproved(state: string | null): boolean {
  if (!state) return false
  const s = state.trim().toLowerCase()
  return DN_APPROVED_STATES.some((a) => a.toLowerCase() === s)
}

/**
 * What must never reach a customer, per brief §7.3 and spec §8: any cost or margin
 * figure, BOM contents, supplier data, internal remarks, rework *reasons*, employee
 * contact details and warehouse names.
 *
 * The invoice and payment columns the Open export now carries are deliberately not
 * mapped above — the finance screen is a later phase, and an unmapped column cannot
 * leak. The guarantee is structural rather than a list: `PortalItem` is a
 * hand-written whitelist, and `scopeToCustomer` is the only code that builds a
 * customer payload.
 *
 * Rework is the one case worth naming: its dates drive a milestone, but its reason
 * and comment are never read, and the customer sees only "Item under modification".
 */
