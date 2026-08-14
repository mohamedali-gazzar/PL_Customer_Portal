import {
  notInSource,
  type Customer,
  type CustomerId,
  type DataSourceInfo,
  type DocumentRef,
  type FinanceSummary,
  type Invoice,
  type Maybe,
  type Payment,
  type PaymentTerm,
  type Project,
  type ProjectId,
  type ProviderCapabilities,
} from '@/domain'
import type {
  CustomerPortfolio,
  DocumentStream,
  PortalDataProvider,
  ProjectQuery,
} from '@/ports/data-provider'
import { loadSnapshot, snapshotSourceInfo, type BacklogSnapshot } from './snapshot'

/**
 * What the backlog export can and cannot answer.
 *
 * Declared once, here, from the discovery analysis. Everything downstream —
 * whether a stage is derivable, whether the Finance screen renders data or an
 * explanation — follows from these flags. Switching to ERPNext is largely a
 * matter of this object changing.
 */
export const EXCEL_CAPABILITIES: ProviderCapabilities = {
  // Derivable: 311 approved / 130 sent for approval / 39 under preparation.
  drawings: true,
  // Derivable: 273 available / 48 partial / 34 not available.
  materialStatus: true,
  // Derivable: 178 completed / 49 in process / 253 not started.
  manufacturing: true,

  // No Stock Entry data, so FAT success can never be observed.
  fatEvents: false,
  // No Stock Entry and no Delivery Note. `Delivered Qty` is 0 on 469 of 480 rows
  // because the export is filtered to open backlog, so it proves nothing.
  deliveryEvents: false,
  // No Sales Invoice and no Payment Entry: stages 5 and 7 and the whole Finance
  // module are unavailable. Decision D3 also keeps Backlog Amount internal.
  finance: false,
  // No File/attachment records.
  documents: false,

  plannedDates: {
    drawings: false, // no RFD request_due_date column
    material: true, // Main Material Delivery Date, 204/480 rows
    manufacturingStart: false, // no planned_start_date column
    manufacturingEnd: true, // Main Planned End Date, 291/480 rows
    fat: false, // no such field in ERPNext yet (PDF §8.1)
    delivery: false, // no such field in ERPNext yet (PDF §8.1)
  },
  actualManufacturingStart: false, // no actual_start_date column

  currency: false, // no currency column at all
  contractValue: false, // no grand_total
  customerPoNo: false,
  cubicles: false,
  contacts: false,

  scope: 'open_backlog_only',
  liveUpdates: false,
}

const FINANCE_UNAVAILABLE =
  'The current data source is an operations backlog export. It contains no Sales Invoice, ' +
  'Payment Entry or currency data, so financial figures cannot be shown. This is a missing ' +
  'data source, not a zero balance.'

const DOCUMENTS_UNAVAILABLE =
  'The current data source contains no document or attachment records, so FAT reports, ' +
  'delivery notes and invoice PDFs are unavailable.'

export interface ExcelProviderOptions {
  readonly filePath: string
}

/**
 * The temporary data provider.
 *
 * Tenant isolation is enforced here in the two places it can be: `getPortfolio`
 * reads only the requesting tenant's index bucket, and `getProject` verifies
 * ownership before returning. A project belonging to another customer returns
 * `null`, identical to one that does not exist — a distinguishable 403 would
 * confirm the id is real.
 */
export class ExcelBacklogProvider implements PortalDataProvider {
  readonly id = 'excel-backlog'

  private readonly options: ExcelProviderOptions

  constructor(options: ExcelProviderOptions) {
    this.options = options
  }

  capabilities(): ProviderCapabilities {
    return EXCEL_CAPABILITIES
  }

  async sourceInfo(): Promise<DataSourceInfo> {
    return snapshotSourceInfo(await this.snapshot())
  }

  /** Diagnostics for the verification script. Not reachable from any route. */
  async inspect(): Promise<BacklogSnapshot> {
    return this.snapshot()
  }

  private snapshot(): Promise<BacklogSnapshot> {
    return loadSnapshot(this.options.filePath)
  }

  async resolveCustomerByContactEmail(_email: string): Promise<Customer | null> {
    // The export has no contact or email data, so no login can be resolved from
    // it. Returning null (rather than inventing a mapping) keeps the auth path
    // honest; the dev session resolver supplies tenants explicitly instead.
    void _email
    return null
  }

  async getCustomer(customerId: CustomerId): Promise<Customer | null> {
    const snapshot = await this.snapshot()
    return snapshot.customers.get(customerId) ?? null
  }

  async getPortfolio(customerId: CustomerId, query?: ProjectQuery): Promise<CustomerPortfolio | null> {
    const snapshot = await this.snapshot()
    const customer = snapshot.customers.get(customerId)
    if (customer === undefined) return null

    // Only ever this tenant's bucket: there is no code path here that reads
    // another tenant's projects.
    let projects = snapshot.projectsByCustomer.get(customerId) ?? []

    if (query?.activeOnly === true) {
      projects = projects.filter(hasOpenWork)
    }
    return { customer, projects }
  }

  async getProject(customerId: CustomerId, projectId: ProjectId): Promise<Project | null> {
    const snapshot = await this.snapshot()
    const owner = snapshot.ownerByProject.get(projectId)
    // Ownership check first. Same answer for "not yours" and "does not exist".
    if (owner === undefined || owner !== customerId) return null
    return snapshot.projectById.get(projectId) ?? null
  }

  async getFinanceSummary(): Promise<Maybe<FinanceSummary>> {
    return notInSource(FINANCE_UNAVAILABLE)
  }

  async listInvoices(): Promise<Maybe<readonly Invoice[]>> {
    return notInSource(FINANCE_UNAVAILABLE)
  }

  async listPayments(): Promise<Maybe<readonly Payment[]>> {
    return notInSource(FINANCE_UNAVAILABLE)
  }

  async getPaymentSchedule(): Promise<Maybe<readonly PaymentTerm[]>> {
    return notInSource(FINANCE_UNAVAILABLE)
  }

  async listDocuments(): Promise<Maybe<readonly DocumentRef[]>> {
    return notInSource(DOCUMENTS_UNAVAILABLE)
  }

  async openDocument(): Promise<DocumentStream | null> {
    return null
  }
}

/** An order still has open work while any line has quantity outstanding. */
function hasOpenWork(project: Project): boolean {
  return project.lines.some((line) => {
    const remaining = line.quantity.remaining
    return remaining.state !== 'known' || remaining.value > 0
  })
}
