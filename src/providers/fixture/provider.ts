/**
 * Synthetic provider.
 *
 * Every automated test runs against this, never against the real backlog export.
 * That keeps real customer names, order values and schedules out of Git (rule #9)
 * and makes the suite deterministic — the real file is a moving target that will
 * be replaced by ERPNext.
 *
 * The fixture is shaped to cover the cases that actually caused design decisions:
 * an item complete through stage 3, an item blocked on customer approval, a
 * loose component with no production journey, a multi-work-order line, and a
 * second tenant used by the cross-tenant tests.
 */

import {
  customerId as toCustomerId,
  known,
  localizedText,
  money,
  notApplicable,
  notInSource,
  orderLineId,
  pending,
  plainDate,
  projectId as toProjectId,
  type Customer,
  type CustomerId,
  type DataSourceInfo,
  type DocumentRef,
  type DrawingRecord,
  type FinanceSummary,
  type Invoice,
  type ItemClass,
  type Maybe,
  type MaterialStatus,
  type OrderLine,
  type Payment,
  type PaymentTerm,
  type PlainDate,
  type ProductionRecord,
  type Project,
  type ProjectId,
  type ProviderCapabilities,
  type WorkOrderRollup,
  type WorkOrderStatus,
} from '@/domain'
import type {
  CustomerPortfolio,
  DocumentStream,
  PortalDataProvider,
  ProjectQuery,
} from '@/ports/data-provider'
import { EXCEL_CAPABILITIES } from '../excel/provider'

export const FIXTURE_TODAY = plainDate('2026-08-13')

export const TENANT_A = toCustomerId('c_fixture_tenant_aaa')
export const TENANT_B = toCustomerId('c_fixture_tenant_bbb')

export const PROJECT_A1 = toProjectId('SO-26-00112')
export const PROJECT_A2 = toProjectId('SO-25-00641')
export const PROJECT_B1 = toProjectId('SO-26-00087')

/* ───────────────────────────── builders ──────────────────────────────── */

interface WorkOrderSeed {
  status?: WorkOrderStatus
  materialStatus?: MaterialStatus
  plannedEndOn?: string
  materialPlannedOn?: string
  materialReadyOn?: string
  manufacturingCompletedOn?: string
  createdOn?: string
  producedQty?: number
  orderedQty?: number
}

function workOrder(seed: WorkOrderSeed): WorkOrderRollup {
  const d = (v: string | undefined, note: string): Maybe<PlainDate> =>
    v === undefined ? pending(note) : known(plainDate(v))
  return {
    status: seed.status === undefined ? pending('no work order') : known(seed.status),
    materialStatus: seed.materialStatus === undefined ? pending('no work order') : known(seed.materialStatus),
    createdOn: d(seed.createdOn, 'no work order raised yet'),
    actualStartOn: notInSource('work_order.actual_start_date is not in this source'),
    plannedStartOn: notInSource('work_order.planned_start_date is not in this source'),
    plannedEndOn: d(seed.plannedEndOn, 'no planned end date'),
    plannedFatOn: notInSource('no planned FAT date field exists yet'),
    plannedDeliveryOn: notInSource('no planned delivery date field exists yet'),
    materialPlannedOn: d(seed.materialPlannedOn, 'no planned material date'),
    materialReplannedOn: pending('not re-planned'),
    materialReadyOn: d(seed.materialReadyOn, 'material not yet transferred'),
    manufacturingCompletedOn: d(seed.manufacturingCompletedOn, 'manufacturing not yet complete'),
    quantity: {
      ordered: seed.orderedQty === undefined ? pending('no work order') : known(seed.orderedQty),
      produced: seed.producedQty === undefined ? pending('no work order') : known(seed.producedQty),
    },
  }
}

interface DrawingSeed {
  initialSubmittedOn?: string
  revisionSubmittedOn?: string
  approvalReceivedOn?: string
  releasedOn?: string
  revisionCount?: number
}

function drawings(seed: DrawingSeed): DrawingRecord {
  const d = (v: string | undefined, note: string): Maybe<PlainDate> =>
    v === undefined ? pending(note) : known(plainDate(v))
  return {
    requestDueOn: notInSource('RFD request_due_date is not in this source'),
    initialSubmittedOn: d(seed.initialSubmittedOn, 'initial drawings not yet submitted'),
    revisionSubmittedOn: d(seed.revisionSubmittedOn, 'no revision submitted'),
    approvalReceivedOn: d(seed.approvalReceivedOn, 'approval not yet received'),
    releasedOn: d(seed.releasedOn, 'drawings not yet released'),
    hasRelease: known(seed.releasedOn !== undefined),
    revisionCount: known(seed.revisionCount ?? 0),
  }
}

interface LineSeed {
  id: string
  itemCode: string
  itemName: string
  itemClass?: ItemClass
  orderedQty: number
  workOrderRefs?: string[]
  wo?: WorkOrderSeed
  rfd?: DrawingSeed
  rework?: { inProgress: boolean; completedOn?: string }
}

function orderLine(projectRef: ProjectId, seed: LineSeed): OrderLine {
  const itemClass = seed.itemClass ?? 'manufactured'
  const production: ProductionRecord | null =
    itemClass === 'supplied_component'
      ? null
      : {
          workOrderRefs: seed.workOrderRefs ?? [],
          workOrderCount: seed.workOrderRefs?.length ?? 0,
          main: workOrder(seed.wo ?? {}),
          rework:
            seed.rework === undefined
              ? null
              : {
                  inProgress: seed.rework.inProgress,
                  completedOn:
                    seed.rework.completedOn === undefined
                      ? pending('rework not complete')
                      : known(plainDate(seed.rework.completedOn)),
                },
          drawings: drawings(seed.rfd ?? {}),
        }

  return {
    id: orderLineId(seed.id),
    projectId: projectRef,
    itemCode: known(seed.itemCode),
    itemName: seed.itemName,
    itemClass,
    itemGroup: known('FIXTURE-GROUP'),
    quantity: {
      ordered: seed.orderedQty,
      delivered: known(0),
      remaining: known(seed.orderedQty),
      produced: seed.wo?.producedQty === undefined ? pending('no work order') : known(seed.wo.producedQty),
    },
    lineValue: known(money(100_000, notInSource('the fixture has no currency, like the export'))),
    cubicles: notInSource('cubicle count is not in this source'),
    production,
  }
}

interface ProjectSeed {
  id: ProjectId
  owner: CustomerId
  name: string
  orderedOn: string
  contractualDate?: string
  pm?: string
  onHold?: boolean
  lines: LineSeed[]
}

function project(seed: ProjectSeed): Project {
  return {
    id: seed.id,
    customerId: seed.owner,
    salesOrderNo: seed.id,
    projectCode: notApplicable('fixture'),
    displayName: localizedText(seed.name),
    customerPoNo: notInSource('customer PO number is not in this source'),
    contractValue: notInSource('sales order grand_total is not in this source'),
    openOrderValue: known(money(1_000_000, notInSource('no currency in this source'))),
    orderedOn: known(plainDate(seed.orderedOn)),
    contractualPeriodDays: known(120),
    contractualDate:
      seed.contractualDate === undefined
        ? notInSource('no contractual date on this order')
        : known(plainDate(seed.contractualDate)),
    projectManager: seed.pm === undefined ? notInSource('no project manager') : known({ displayName: seed.pm }),
    onHold: known(seed.onHold ?? false),
    lines: seed.lines.map((l) => orderLine(seed.id, l)),
  }
}

/* ─────────────────────────── the fixture ─────────────────────────────── */

const PROJECTS: readonly Project[] = [
  project({
    id: PROJECT_A1,
    owner: TENANT_A,
    name: 'Fixture Water Plant — Phase 2',
    orderedOn: '2026-02-01',
    contractualDate: '2026-09-28',
    pm: 'Fixture PM',
    lines: [
      // Complete through stage 3: drawings approved, material in, manufacturing done.
      {
        id: 'l_fixture_a1_complete',
        itemCode: 'MDP-112-26',
        itemName: 'MDP — Main Distribution Panel',
        orderedQty: 1,
        workOrderRefs: ['MFG-WO-FIXTURE-0001'],
        rfd: { initialSubmittedOn: '2026-02-10', approvalReceivedOn: '2026-03-01', releasedOn: '2026-03-03' },
        wo: {
          status: 'completed',
          materialStatus: 'available',
          createdOn: '2026-03-05',
          materialPlannedOn: '2026-04-15',
          materialReadyOn: '2026-04-20',
          plannedEndOn: '2026-06-10',
          manufacturingCompletedOn: '2026-07-24',
          orderedQty: 1,
          producedQty: 1,
        },
      },
      // Waiting on the customer: drawings submitted, never released.
      {
        id: 'l_fixture_a1_awaiting',
        itemCode: 'ATS-112-26',
        itemName: 'ATS — Automatic Transfer Switch Panel',
        orderedQty: 2,
        rfd: { initialSubmittedOn: '2026-06-01' },
        wo: {},
      },
      // A loose component: no drawings, no work order, no 7-stage journey.
      {
        id: 'l_fixture_a1_component',
        itemCode: '1SDA-FIXTURE',
        itemName: 'Moulded case circuit breaker',
        itemClass: 'supplied_component',
        orderedQty: 6,
      },
    ],
  }),
  project({
    id: PROJECT_A2,
    owner: TENANT_A,
    name: 'Fixture Factory Expansion',
    orderedOn: '2025-11-02',
    contractualDate: '2026-07-01', // already past — exercises the schedule rule
    pm: 'Fixture PM',
    lines: [
      // Several work orders with differing statuses → conservative `mixed` rollup.
      {
        id: 'l_fixture_a2_mixed',
        itemCode: 'MCC-641-25',
        itemName: 'MCC — Motor Control Center',
        orderedQty: 4,
        workOrderRefs: ['MFG-WO-FIXTURE-0002', 'MFG-WO-FIXTURE-0003'],
        rfd: { initialSubmittedOn: '2025-11-20', approvalReceivedOn: '2025-12-15', releasedOn: '2025-12-18', revisionCount: 2 },
        wo: {
          status: 'mixed',
          materialStatus: 'partially_available',
          createdOn: '2026-01-05',
          materialPlannedOn: '2026-03-01',
          materialReadyOn: '2026-03-10',
          plannedEndOn: '2026-05-01',
          orderedQty: 4,
          producedQty: 2,
        },
      },
      // Rework in progress → neutral status only.
      {
        id: 'l_fixture_a2_rework',
        itemCode: 'PFC-641-25',
        itemName: 'PFC — Capacitor Bank',
        orderedQty: 1,
        workOrderRefs: ['MFG-WO-FIXTURE-0004'],
        rfd: { initialSubmittedOn: '2025-11-20', approvalReceivedOn: '2025-12-15', releasedOn: '2025-12-18' },
        wo: {
          status: 'completed',
          materialStatus: 'available',
          createdOn: '2026-01-05',
          materialReadyOn: '2026-02-10',
          plannedEndOn: '2026-04-01',
          manufacturingCompletedOn: '2026-05-20',
          orderedQty: 1,
          producedQty: 1,
        },
        rework: { inProgress: true },
      },
    ],
  }),
  // A second tenant. Used by the cross-tenant isolation tests.
  project({
    id: PROJECT_B1,
    owner: TENANT_B,
    name: 'Fixture Hotel — LV Rooms',
    orderedOn: '2026-03-01',
    contractualDate: '2026-11-15',
    pm: 'Other PM',
    lines: [
      {
        id: 'l_fixture_b1_only',
        itemCode: 'SMDB-087-26',
        itemName: 'SMDB — Sub Main Distribution Board',
        orderedQty: 3,
        workOrderRefs: ['MFG-WO-FIXTURE-0005'],
        rfd: { initialSubmittedOn: '2026-03-20' },
        wo: { status: 'not_started', materialStatus: 'not_available', createdOn: '2026-04-01', orderedQty: 3, producedQty: 0 },
      },
    ],
  }),
]

const CUSTOMERS: ReadonlyMap<CustomerId, Customer> = new Map([
  [
    TENANT_A,
    {
      id: TENANT_A,
      erpCustomerId: notInSource('fixture has no ERPNext customer id, like the export'),
      displayName: localizedText('Fixture Contracting Co.'),
    },
  ],
  [
    TENANT_B,
    {
      id: TENANT_B,
      erpCustomerId: notInSource('fixture has no ERPNext customer id, like the export'),
      displayName: localizedText('Other Fixture Industrial'),
    },
  ],
])

/**
 * Mirrors the Excel provider exactly, including its capability set, so a test
 * passing here is meaningful for the real provider. Only `providerId` differs.
 */
export class FixtureProvider implements PortalDataProvider {
  readonly id = 'fixture'

  capabilities(): ProviderCapabilities {
    return EXCEL_CAPABILITIES
  }

  async sourceInfo(): Promise<DataSourceInfo> {
    return {
      providerId: this.id,
      label: localizedText('Synthetic fixture'),
      asOf: known(FIXTURE_TODAY),
      isLive: false,
      scopeCaveat: known('Synthetic data for tests. Mirrors the Excel export capabilities.'),
      identityAssurance: {
        level: 'provisional',
        source: 'derived_from_customer_name',
        risk: 'Fixture identities are synthetic.',
      },
    }
  }

  async resolveCustomerByContactEmail(email: string): Promise<Customer | null> {
    if (email === 'a@fixture.test') return CUSTOMERS.get(TENANT_A) ?? null
    if (email === 'b@fixture.test') return CUSTOMERS.get(TENANT_B) ?? null
    return null
  }

  async getCustomer(customerId: CustomerId): Promise<Customer | null> {
    return CUSTOMERS.get(customerId) ?? null
  }

  async getPortfolio(customerId: CustomerId, query?: ProjectQuery): Promise<CustomerPortfolio | null> {
    const customer = CUSTOMERS.get(customerId)
    if (customer === undefined) return null
    let projects = PROJECTS.filter((p) => p.customerId === customerId)
    if (query?.activeOnly === true) projects = projects.filter((p) => p.lines.length > 0)
    return { customer, projects }
  }

  async getProject(customerId: CustomerId, projectId: ProjectId): Promise<Project | null> {
    const found = PROJECTS.find((p) => p.id === projectId)
    // Ownership check, and the same `null` for "not yours" as for "not found".
    if (found === undefined || found.customerId !== customerId) return null
    return found
  }

  async getFinanceSummary(): Promise<Maybe<FinanceSummary>> {
    return notInSource('fixture mirrors the export: no finance data')
  }
  async listInvoices(): Promise<Maybe<readonly Invoice[]>> {
    return notInSource('fixture mirrors the export: no finance data')
  }
  async listPayments(): Promise<Maybe<readonly Payment[]>> {
    return notInSource('fixture mirrors the export: no finance data')
  }
  async getPaymentSchedule(): Promise<Maybe<readonly PaymentTerm[]>> {
    return notInSource('fixture mirrors the export: no finance data')
  }
  async listDocuments(): Promise<Maybe<readonly DocumentRef[]>> {
    return notInSource('fixture mirrors the export: no document data')
  }
  async openDocument(): Promise<DocumentStream | null> {
    return null
  }
}
