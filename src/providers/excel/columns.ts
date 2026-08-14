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
 * What must never reach a customer, per brief §7.3: any cost or margin figure, BOM
 * contents, supplier data, internal remarks, rework *reasons*, employee contact
 * details and warehouse names.
 *
 * None of those appear in this export, so there is no column to exclude here. The
 * guarantee is structural rather than a list: `PortalItem` is a hand-written
 * whitelist, and `scopeToCustomer` is the only code that builds a customer payload.
 * If the export ever gains a cost column, adding it to `PortalItem` would have to be
 * a deliberate act.
 *
 * Rework is the one case worth naming: its dates drive milestone 4, but its reason
 * and comment are never read, and the customer sees only neutral wording.
 */
