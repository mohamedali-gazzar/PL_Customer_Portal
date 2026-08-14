import type { Maybe } from './maybe'
import type { PlainDate } from './plain-date'
import type { CustomerId, OrderLineId, ProjectId, ContactId } from './ids'
import type { LocalizedText, Money } from './primitives'
import type { MilestoneSet, StageId } from './milestone'

/* ────────────────────────────── Tenant ────────────────────────────── */

export interface Customer {
  readonly id: CustomerId
  /**
   * The real ERPNext `Customer.name` link id.
   *
   * Unknown while the Excel provider is active: the export carries only a
   * free-text customer name, so `id` is derived from that name. That makes the
   * tenant key provisional — see `IdentityAssurance` and DECISIONS.md D1.
   */
  readonly erpCustomerId: Maybe<string>
  readonly displayName: LocalizedText
}

/**
 * How trustworthy the tenant key is. Surfaced all the way up so the portal can
 * refuse to run in production on a provisional identity rather than quietly
 * risking a cross-customer mix-up if a name is edited in ERPNext.
 */
export type IdentityAssurance =
  | { readonly level: 'verified'; readonly source: 'erpnext_customer_id' }
  | { readonly level: 'provisional'; readonly source: 'derived_from_customer_name'; readonly risk: string }

export interface PortalContact {
  readonly id: ContactId
  readonly customerId: CustomerId
  readonly email: string
  readonly displayName: string
  /** PDF §6.1: an "admin contact" flag controls who may see financials. */
  readonly permissions: { readonly viewProgress: boolean; readonly viewFinance: boolean }
  readonly locale: 'en' | 'ar'
}

/* ──────────────────────────── Commercial ──────────────────────────── */

/**
 * One customer project. The backlog export shows Project and Sales Order in a
 * strict 1:1 relationship (152 of each, no project spanning two orders and no
 * order spanning two projects), so they are modelled as one aggregate with both
 * references retained rather than as two entities.
 */
export interface Project {
  readonly id: ProjectId
  readonly customerId: CustomerId
  readonly salesOrderNo: string
  readonly projectCode: Maybe<string>
  readonly displayName: LocalizedText

  readonly customerPoNo: Maybe<string>
  /** ERPNext `Sales Order.grand_total`. Absent from the backlog export. */
  readonly contractValue: Maybe<Money>
  /**
   * Value of the *undelivered* quantity ("Backlog Amount").
   *
   * INTERNAL ONLY (decision D3): this is not contract value, and dividing it by
   * quantity reveals unit price. It is deliberately excluded from every
   * customer-facing DTO and the exclusion is enforced by a contract test.
   */
  readonly openOrderValue: Maybe<Money>

  readonly orderedOn: Maybe<PlainDate>
  readonly contractualPeriodDays: Maybe<number>
  /**
   * Contractual delivery date. Verified independent of `orderedOn +
   * contractualPeriodDays` (they disagree on 277 of 311 rows), so it is stored,
   * never derived.
   */
  readonly contractualDate: Maybe<PlainDate>

  /** Display name only. Employee email, phone and id are never modelled. */
  readonly projectManager: Maybe<{ readonly displayName: string }>

  /** INTERNAL ONLY (decision D4): business meaning unconfirmed. */
  readonly onHold: Maybe<boolean>

  readonly lines: readonly OrderLine[]
}

/**
 * Whether a line has a production journey at all.
 *
 * 37 rows in the export are loose components (MCB, Tmax, Copper Busbar, ABB
 * part numbers) with no Request For Design and no Work Order. The 7-stage
 * tracker is meaningless for them, so they are classified rather than shown
 * with an empty tracker that would read as "nothing has happened".
 */
export type ItemClass = 'manufactured' | 'supplied_component' | 'unknown'

export interface OrderLine {
  readonly id: OrderLineId
  readonly projectId: ProjectId
  readonly itemCode: Maybe<string>
  readonly itemName: string
  readonly itemClass: ItemClass
  /** INTERNAL ONLY: internal product taxonomy, reveals BOM structure. */
  readonly itemGroup: Maybe<string>

  readonly quantity: {
    readonly ordered: number
    /**
     * Delivered quantity. In an open-backlog export this is ~0 on every row by
     * construction, which is why `ProviderCapabilities.scope` exists: a caller
     * must not read 0 here as "nothing was delivered".
     */
    readonly delivered: Maybe<number>
    readonly remaining: Maybe<number>
    readonly produced: Maybe<number>
  }

  /** INTERNAL ONLY (decision D3). */
  readonly lineValue: Maybe<Money>
  /** Number of cubicles. Absent from the backlog export. */
  readonly cubicles: Maybe<number>

  /** `null` when the line has no production journey. */
  readonly production: ProductionRecord | null
}

/* ──────────────────────────── Production ─────────────────────────── */

export interface ProductionRecord {
  /**
   * Opaque internal references to the underlying Work Orders. ERPNext document
   * names are internal ids and never appear in a DTO.
   */
  readonly workOrderRefs: readonly string[]
  readonly workOrderCount: number
  readonly main: WorkOrderRollup
  readonly rework: ReworkSummary | null
  readonly drawings: DrawingRecord
}

export type WorkOrderStatus = 'not_started' | 'in_process' | 'completed' | 'closed' | 'mixed'
export type MaterialStatus = 'not_available' | 'partially_available' | 'available'

/**
 * The Work Order facts for a line, rolled up when a line has several.
 *
 * 28 rows in the export carry more than one Work Order with statuses combined
 * as text ("Completed, Not Started"). Those roll up to `mixed`, and the stage
 * engine resolves `mixed` to the *least* advanced status so progress is never
 * overstated.
 */
export interface WorkOrderRollup {
  readonly status: Maybe<WorkOrderStatus>
  readonly materialStatus: Maybe<MaterialStatus>

  /**
   * Work Order `creation`.
   *
   * Deliberately NOT named `actualStartOn`. ERPNext has a real
   * `actual_start_date`; this column is the creation timestamp, and treating
   * one as the other would invent a manufacturing start date.
   */
  readonly createdOn: Maybe<PlainDate>
  /** ERPNext `actual_start_date`. Absent from the backlog export. */
  readonly actualStartOn: Maybe<PlainDate>
  /** ERPNext `planned_start_date`. Absent from the backlog export. */
  readonly plannedStartOn: Maybe<PlainDate>
  readonly plannedEndOn: Maybe<PlainDate>

  /**
   * Planned FAT and planned delivery dates.
   *
   * PDF §8.1 records that ERPNext has no dedicated field for either yet, and
   * that two custom fields on Work Order are to be added. They are modelled now
   * so the stage engine needs no change when they appear.
   */
  readonly plannedFatOn: Maybe<PlainDate>
  readonly plannedDeliveryOn: Maybe<PlainDate>

  /** `material_delivery_date` — the planned date for stage 2. */
  readonly materialPlannedOn: Maybe<PlainDate>
  /** INTERNAL ONLY: revised material date; exposes internal re-planning. */
  readonly materialReplannedOn: Maybe<PlainDate>
  /** `custom_last_material_transfer_for_manufacture` — actual for stage 2. */
  readonly materialReadyOn: Maybe<PlainDate>
  /** `custom_manufacture_submission_date` — actual end for stage 3. */
  readonly manufacturingCompletedOn: Maybe<PlainDate>

  readonly quantity: { readonly ordered: Maybe<number>; readonly produced: Maybe<number> }
}

/**
 * PDF §4: the customer sees a neutral status only — never a rework reason,
 * comment or count. Only these two fields exist, by design.
 */
export interface ReworkSummary {
  readonly inProgress: boolean
  readonly completedOn: Maybe<PlainDate>
}

export interface DrawingRecord {
  /** RFD `request_due_date` — the planned date for stage 1. Absent from the export. */
  readonly requestDueOn: Maybe<PlainDate>
  readonly initialSubmittedOn: Maybe<PlainDate>
  readonly revisionSubmittedOn: Maybe<PlainDate>
  /** Release RFD `creation` — when approval came back from the customer. */
  readonly approvalReceivedOn: Maybe<PlainDate>
  /** Release RFD submission — `custom_approval_date` in ERPNext terms. */
  readonly releasedOn: Maybe<PlainDate>
  readonly hasRelease: Maybe<boolean>
  /** INTERNAL ONLY (decision D6): revision count invites blame disputes. */
  readonly revisionCount: Maybe<number>
}

/* ───────────────────────── Computed timeline ──────────────────────── */

export interface ItemTimeline {
  readonly milestones: MilestoneSet
  readonly currentStage: Maybe<StageId>
  readonly nextMilestone: Maybe<{ readonly stage: StageId; readonly plannedOn: Maybe<PlainDate> }>
  readonly progressPercent: Maybe<number>
  /**
   * Exactly which stages `progressPercent` covers.
   *
   * With the Excel provider this is [1,2,3] — so the UI must say "of stages
   * 1–3", never "68% complete", which would imply all seven.
   */
  readonly progressBasis: readonly StageId[]
  readonly blockedOnCustomer: Maybe<BlockedOnCustomer>
}

export interface BlockedOnCustomer {
  readonly reason: 'drawing_approval'
  readonly sinceDays: Maybe<number>
  readonly since: Maybe<PlainDate>
}

/* ───────────────────── Finance & documents (M6) ───────────────────── */

export interface FinanceSummary {
  readonly contractTotal: Maybe<Money>
  readonly invoiced: Maybe<Money>
  readonly paid: Maybe<Money>
  readonly outstanding: Maybe<Money>
  readonly overdue: Maybe<Money>
  readonly aging: Maybe<AgingBuckets>
}

export interface AgingBuckets {
  readonly d0_30: Money
  readonly d31_60: Money
  readonly d61_90: Money
  readonly d90plus: Money
}

export interface Invoice {
  readonly id: string
  readonly number: string
  readonly projectId: Maybe<ProjectId>
  readonly postingDate: PlainDate
  readonly dueDate: Maybe<PlainDate>
  readonly total: Money
  readonly outstanding: Money
  readonly status: string
  readonly pdf: Maybe<DocumentRef>
}

export interface Payment {
  readonly id: string
  readonly postingDate: PlainDate
  readonly amount: Money
  readonly method: Maybe<string>
  readonly allocatedTo: readonly { readonly kind: 'invoice' | 'order'; readonly ref: string }[]
}

export interface PaymentTerm {
  readonly label: string
  readonly percent: Maybe<number>
  readonly amount: Money
  readonly dueDate: Maybe<PlainDate>
  readonly status: 'paid' | 'upcoming' | 'not_due' | 'overdue'
}

export type DocumentKind = 'fat_report' | 'delivery_note' | 'invoice' | 'statement' | 'drawing'

export interface DocumentRef {
  readonly id: string
  readonly kind: DocumentKind
  readonly title: string
  readonly issuedOn: Maybe<PlainDate>
  readonly sizeBytes: Maybe<number>
}

/* ───────────────────────── Source transparency ────────────────────── */

/**
 * Shipped with every screen payload so the portal can always tell the customer
 * how fresh the data is and what it excludes. This single field is what makes
 * an Excel-backed portal honest rather than misleading.
 */
export interface DataSourceInfo {
  readonly providerId: string
  readonly label: LocalizedText
  readonly asOf: Maybe<PlainDate>
  readonly isLive: boolean
  readonly scopeCaveat: Maybe<string>
  readonly identityAssurance: IdentityAssurance
}
