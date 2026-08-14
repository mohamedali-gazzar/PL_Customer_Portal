/**
 * Terse builders for domain objects.
 *
 * Everything defaults to "unknown", so a test states only the fields its rule
 * actually depends on. That keeps each case readable next to the PDF §4 rule it
 * checks, and means a test cannot accidentally pass because of an incidental
 * default that happened to be present.
 */

import {
  known,
  notInSource,
  orderLineId,
  pending,
  plainDate,
  projectId as toProjectId,
  customerId as toCustomerId,
  localizedText,
  money,
  notApplicable,
  type DrawingRecord,
  type ItemClass,
  type Maybe,
  type MaterialStatus,
  type OrderLine,
  type PlainDate,
  type ProductionRecord,
  type Project,
  type ProviderCapabilities,
  type ReworkSummary,
  type WorkOrderRollup,
  type WorkOrderStatus,
} from '@/domain'
import { EXCEL_CAPABILITIES } from '@/providers'

export const TODAY = plainDate('2026-08-13')

function d(value: string | undefined): Maybe<PlainDate> {
  return value === undefined ? pending('not yet') : known(plainDate(value))
}

export interface WoSeed {
  status?: WorkOrderStatus
  materialStatus?: MaterialStatus
  createdOn?: string
  plannedEndOn?: string
  plannedStartOn?: string
  actualStartOn?: string
  materialPlannedOn?: string
  materialReadyOn?: string
  manufacturingCompletedOn?: string
  plannedFatOn?: string
  plannedDeliveryOn?: string
}

export function wo(seed: WoSeed = {}): WorkOrderRollup {
  return {
    status: seed.status === undefined ? pending('no work order') : known(seed.status),
    materialStatus: seed.materialStatus === undefined ? pending('no work order') : known(seed.materialStatus),
    createdOn: d(seed.createdOn),
    actualStartOn: seed.actualStartOn === undefined ? notInSource('not in source') : known(plainDate(seed.actualStartOn)),
    plannedStartOn: seed.plannedStartOn === undefined ? notInSource('not in source') : known(plainDate(seed.plannedStartOn)),
    plannedEndOn: d(seed.plannedEndOn),
    plannedFatOn: seed.plannedFatOn === undefined ? notInSource('not in source') : known(plainDate(seed.plannedFatOn)),
    plannedDeliveryOn: seed.plannedDeliveryOn === undefined ? notInSource('not in source') : known(plainDate(seed.plannedDeliveryOn)),
    materialPlannedOn: d(seed.materialPlannedOn),
    materialReplannedOn: pending('not re-planned'),
    materialReadyOn: d(seed.materialReadyOn),
    manufacturingCompletedOn: d(seed.manufacturingCompletedOn),
    quantity: { ordered: pending('n/a'), produced: pending('n/a') },
  }
}

export interface RfdSeed {
  requestDueOn?: string
  initialSubmittedOn?: string
  revisionSubmittedOn?: string
  approvalReceivedOn?: string
  releasedOn?: string
  hasRelease?: boolean
}

export function rfd(seed: RfdSeed = {}): DrawingRecord {
  return {
    requestDueOn: seed.requestDueOn === undefined ? notInSource('not in source') : known(plainDate(seed.requestDueOn)),
    initialSubmittedOn: d(seed.initialSubmittedOn),
    revisionSubmittedOn: d(seed.revisionSubmittedOn),
    approvalReceivedOn: d(seed.approvalReceivedOn),
    releasedOn: d(seed.releasedOn),
    hasRelease: known(seed.hasRelease ?? seed.releasedOn !== undefined),
    revisionCount: known(0),
  }
}

export interface LineSeed {
  id?: string
  itemClass?: ItemClass
  orderedQty?: number
  deliveredQty?: number
  wo?: WoSeed
  rfd?: RfdSeed
  rework?: { inProgress: boolean; completedOn?: string }
  noProduction?: boolean
}

export function line(seed: LineSeed = {}): OrderLine {
  const pid = toProjectId('SO-TEST-0001')
  const rework: ReworkSummary | null =
    seed.rework === undefined
      ? null
      : { inProgress: seed.rework.inProgress, completedOn: d(seed.rework.completedOn) }

  const production: ProductionRecord | null =
    seed.noProduction === true || seed.itemClass === 'supplied_component'
      ? null
      : {
          workOrderRefs: [],
          workOrderCount: 1,
          main: wo(seed.wo),
          rework,
          drawings: rfd(seed.rfd),
        }

  return {
    id: orderLineId(seed.id ?? 'l_test'),
    projectId: pid,
    itemCode: known('ITEM-TEST'),
    itemName: 'Test item',
    itemClass: seed.itemClass ?? 'manufactured',
    itemGroup: known('TEST-GROUP'),
    quantity: {
      ordered: seed.orderedQty ?? 1,
      delivered: known(seed.deliveredQty ?? 0),
      remaining: known((seed.orderedQty ?? 1) - (seed.deliveredQty ?? 0)),
      produced: pending('n/a'),
    },
    lineValue: notInSource('internal only'),
    cubicles: notInSource('not in source'),
    production,
  }
}

export function project(seed: { lines?: OrderLine[]; contractualDate?: string; orderedOn?: string } = {}): Project {
  const id = toProjectId('SO-TEST-0001')
  return {
    id,
    customerId: toCustomerId('c_test'),
    salesOrderNo: 'SO-TEST-0001',
    projectCode: notApplicable('test'),
    displayName: localizedText('Test project'),
    customerPoNo: notInSource('not in source'),
    contractValue: notInSource('not in source'),
    openOrderValue: known(money(1000, notInSource('no currency'))),
    orderedOn: seed.orderedOn === undefined ? notInSource('n/a') : known(plainDate(seed.orderedOn)),
    contractualPeriodDays: known(120),
    contractualDate:
      seed.contractualDate === undefined ? notInSource('none') : known(plainDate(seed.contractualDate)),
    projectManager: known({ displayName: 'Test PM' }),
    onHold: known(false),
    lines: seed.lines ?? [line()],
  }
}

/** The capabilities of the current temporary source. */
export const excelCaps: ProviderCapabilities = EXCEL_CAPABILITIES

/**
 * What the ERPNext provider will declare in M6.
 *
 * Used to prove the central architectural claim: flipping these flags is enough to
 * light up stages 4–7, with no change to the rules, the composers or the DTOs.
 */
export const erpnextCaps: ProviderCapabilities = {
  drawings: true,
  materialStatus: true,
  manufacturing: true,
  fatEvents: true,
  deliveryEvents: true,
  finance: { invoices: true, payments: true, schedule: true, aging: true },
  documents: true,
  plannedDates: {
    drawings: true,
    material: true,
    manufacturingStart: true,
    manufacturingEnd: true,
    fat: true,
    delivery: true,
  },
  actualManufacturingStart: true,
  currency: true,
  contractValue: true,
  customerPoNo: true,
  cubicles: true,
  contacts: true,
  scope: 'full_order_book',
  liveUpdates: true,
}
