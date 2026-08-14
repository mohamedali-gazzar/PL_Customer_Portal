/**
 * The single source of truth for the backlog export's shape.
 *
 * Header names are transcribed verbatim from
 *   "PM Phase Cycle Times - Open Backlog_2018-01-01_2026-08-11 (1).xlsx",
 * sheet "Query Report", 58 columns.
 *
 * The loader validates the real header against this list and refuses to run on a
 * mismatch. A silently renamed or reordered column would otherwise produce a
 * portal full of blank milestones that looks like "nothing has happened" — the
 * exact failure this codebase is built to prevent. Loud failure is the point.
 */

export const SHEET_NAME = 'Query Report'

export const COLUMNS = {
  salesOrder: 'Sales Order',
  project: 'Project',
  customer: 'Customer',
  projectManager: 'Project Manager',
  itemGroup: 'Item Group',
  item: 'Item',
  itemName: 'Item Name',
  onHold: 'On Hold',
  soQty: 'SO Qty',
  deliveredQty: 'Delivered Qty',
  remainingQty: 'Remaining Qty',
  backlogAmount: 'Backlog Amount',
  soSubmitted: 'SO Submitted',
  contractualPeriodDays: 'Contractual Period (d)',
  contractualDate: 'Contractual Date',

  initialApprovalRfds: 'Initial Approval RFDs',
  iaCreated: 'IA Created',
  iaSubmitted: 'IA Submitted',
  revisionRfds: 'Revision RFDs',
  revCreated: 'Rev Created',
  revSubmitted: 'Rev Submitted',
  releasedRfds: 'Released RFDs',
  relCreated: 'Rel Created',
  relSubmitted: 'Rel Submitted',

  woCount: 'WOs',
  workOrder: 'Work Order',
  woQty: 'WO Qty',
  producedQty: 'Produced Qty',

  mainWoCount: 'Main WOs',
  mainWoStatus: 'Main WO Status',
  mainCreated: 'Main Created',
  mainMaterialStatus: 'Main Material Status',
  mainMaterialDeliveryDate: 'Main Material Delivery Date',
  mainPlannedEndDate: 'Main Planned End Date',
  mainModifiedMaterialDeliveryDate: 'Main Modified Material Delivery Date',
  mainMaterialReady: 'Main Material Ready',
  mainClosed: 'Main Closed',
  mainDays: 'Main Days',

  reworkWoCount: 'Rework WOs',
  reworkWoStatus: 'Rework WO Status',
  reworkCreated: 'Rework Created',
  reworkMaterialStatus: 'Rework Material Status',
  reworkMaterialDeliveryDate: 'Rework Material Delivery Date',
  reworkPlannedEndDate: 'Rework Planned End Date',
  reworkModifiedMaterialDeliveryDate: 'Rework Modified Material Delivery Date',
  reworkMaterialReady: 'Rework Material Ready',
  reworkClosed: 'Rework Closed',
  reworkDays: 'Rework Days',

  t1DrawingsSubmission: 'T1 Drawings Submission (d)',
  t2CustomerApproval: 'T2 Customer Approval (d)',
  t3WoRelease: 'T3 WO Release (d)',
  t4Material: 'T4 Material (d)',
  t5Manufacturing: 'T5 Manufacturing (d)',
  t6ReworkRelease: 'T6 Rework Release (d)',
  t7ReworkMaterial: 'T7 Rework Material (d)',
  t8ReworkManufacturing: 'T8 Rework Manufacturing (d)',

  ageSinceSo: 'Age Since SO (d)',
  daysToContractual: 'Days To Contractual (d)',
} as const

export type ColumnKey = keyof typeof COLUMNS
export const COLUMN_KEYS = Object.keys(COLUMNS) as ColumnKey[]
export const EXPECTED_COLUMN_COUNT = COLUMN_KEYS.length

/**
 * Columns that must never reach a customer-facing DTO.
 *
 * This is documentation and a test fixture, not the enforcement mechanism — the
 * real guarantee is that DTOs are hand-written whitelists and are scanned by
 * `tests/security/dto-blacklist.test.ts`. Listing them here keeps the reasoning
 * next to the data.
 */
export const INTERNAL_ONLY_COLUMNS: readonly ColumnKey[] = [
  'itemGroup', // internal product taxonomy; reveals BOM structure
  'backlogAmount', // decision D3: not contract value, and reveals unit price
  'workOrder', // internal ERPNext document ids
  'woCount',
  'mainWoCount',
  'mainModifiedMaterialDeliveryDate', // exposes internal re-planning
  'mainDays', // internal cycle-time KPI
  'onHold', // decision D4: business meaning unconfirmed
  'iaCreated', // internal preparation time
  'revCreated',
  'relCreated',
  'initialApprovalRfds',
  'revisionRfds', // decision D6: a revision count invites blame disputes
  'releasedRfds',
  // Rework internals — PDF §4 allows a neutral status only.
  'reworkWoCount',
  'reworkWoStatus',
  'reworkCreated',
  'reworkMaterialStatus',
  'reworkMaterialDeliveryDate',
  'reworkPlannedEndDate',
  'reworkModifiedMaterialDeliveryDate',
  'reworkMaterialReady',
  'reworkDays',
  // Internal cycle-time KPIs. T2 is the exception: it measures the customer's
  // own approval turnaround and is surfaced as "awaiting your approval for N days".
  't1DrawingsSubmission',
  't3WoRelease',
  't4Material',
  't5Manufacturing',
  't6ReworkRelease',
  't7ReworkMaterial',
  't8ReworkManufacturing',
  'mainDays',
  // Frozen as of the export date; always recomputed live instead.
  'ageSinceSo',
  'daysToContractual',
]
