/**
 * The single seam between the portal and its backend.
 *
 * Today `ExcelBacklogProvider` implements it; later `ErpNextApiProvider` will.
 * Nothing above this port knows which is active.
 *
 * Two properties are structural rather than conventional:
 *
 *  1. **Tenant isolation.** Every method takes `CustomerId` as its first
 *     argument, and `CustomerId` is a branded type that cannot be produced from
 *     request input without an explicit conversion. There is no signature here
 *     capable of returning cross-tenant data.
 *
 *  2. **No N+1.** The portfolio and project reads each return a whole aggregate
 *     in one call. There is deliberately no `getLine`, `getWorkOrder` or
 *     `getMilestones` method — the port offers no shape a caller could loop over
 *     per item, so the "browser must never orchestrate multiple ERPNext calls"
 *     rule cannot be violated by accident upstream.
 */

import type {
  Customer,
  CustomerId,
  DataSourceInfo,
  DocumentRef,
  FinanceSummary,
  Invoice,
  Maybe,
  Payment,
  PaymentTerm,
  Project,
  ProjectId,
  ProviderCapabilities,
} from '@/domain'

/** All of one customer's projects with their lines. One call, no per-item reads. */
export interface CustomerPortfolio {
  readonly customer: Customer
  readonly projects: readonly Project[]
}

export interface ProjectQuery {
  /** Fetch only projects that still have open work. */
  readonly activeOnly?: boolean
}

export interface DocumentQuery {
  readonly projectId?: ProjectId
  readonly kinds?: readonly DocumentRef['kind'][]
}

export interface DocumentStream {
  readonly ref: DocumentRef
  readonly contentType: string
  readonly body: ReadableStream<Uint8Array>
}

export interface PortalDataProvider {
  readonly id: string

  /** Declared, not inferred. See `ProviderCapabilities`. */
  capabilities(): ProviderCapabilities
  sourceInfo(): Promise<DataSourceInfo>

  /**
   * Resolve a login to its customer. The only method that maps an outside
   * identifier to a tenant, and therefore the only place that boundary is
   * crossed.
   */
  resolveCustomerByContactEmail(email: string): Promise<Customer | null>
  getCustomer(customerId: CustomerId): Promise<Customer | null>

  /** Dashboard and project list. */
  getPortfolio(customerId: CustomerId, query?: ProjectQuery): Promise<CustomerPortfolio | null>

  /**
   * Project detail. Returns `null` both when the project does not exist and when
   * it belongs to another customer — an implementation must not distinguish the
   * two, since a 403 would confirm the id exists.
   */
  getProject(customerId: CustomerId, projectId: ProjectId): Promise<Project | null>

  /* Finance and documents. `Maybe` at the method level: a provider that cannot
   * serve these returns an explicit unknown, never an empty array — an empty
   * invoice list would read as "you owe nothing". */
  getFinanceSummary(customerId: CustomerId, projectId?: ProjectId): Promise<Maybe<FinanceSummary>>
  listInvoices(customerId: CustomerId, projectId?: ProjectId): Promise<Maybe<readonly Invoice[]>>
  listPayments(customerId: CustomerId, projectId?: ProjectId): Promise<Maybe<readonly Payment[]>>
  getPaymentSchedule(customerId: CustomerId, projectId: ProjectId): Promise<Maybe<readonly PaymentTerm[]>>

  listDocuments(customerId: CustomerId, query?: DocumentQuery): Promise<Maybe<readonly DocumentRef[]>>
  openDocument(customerId: CustomerId, documentId: string): Promise<DocumentStream | null>
}

/** Method names, used by the metrics decorator and the call-budget tests. */
export type ProviderMethod = keyof Omit<PortalDataProvider, 'id' | 'capabilities'>
