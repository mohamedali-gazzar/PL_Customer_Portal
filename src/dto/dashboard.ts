import type {
  BlockedOnCustomerDto,
  DataSourceDto,
  MaybeDto,
  ProgressDto,
  ScheduleDto,
  StageIdDto,
  UnavailabilityDto,
} from './common'

/**
 * Dashboard payload.
 *
 * Compare with mockup 1, whose five tiles are Total contract value, Paid to date,
 * Outstanding, Overdue and Needs your action. Four of the five need Sales Invoice
 * and Payment Entry data that the temporary source does not contain, so they are
 * absent from this type and `unavailable.finance` carries the reason. They return
 * when the ERPNext provider sets `capabilities.finance`.
 *
 * "Needs your action" is real today: it is derived from Request For Design
 * evidence, the same way the company's own T2 metric is.
 */
export interface DashboardDto {
  readonly source: DataSourceDto
  readonly customer: { readonly displayName: string }
  readonly summary: DashboardSummaryDto
  readonly projects: readonly DashboardProjectCardDto[]
  readonly unavailable: {
    readonly finance: UnavailabilityDto | null
    readonly documents: UnavailabilityDto | null
    readonly delivery: UnavailabilityDto | null
    readonly identity: UnavailabilityDto | null
  }
}

export interface DashboardSummaryDto {
  readonly activeProjects: number
  readonly itemsTotal: number
  readonly itemsInManufacturing: number
  readonly itemsCompletedManufacturing: number
  /** Items whose drawings are with the customer and not yet approved. */
  readonly awaitingYourApproval: number
  readonly projectsPastContractualDate: number
  /**
   * Deliberately a `MaybeDto`, not a number.
   *
   * Mockup 1 shows "ITEMS DELIVERED 1 / 4". Delivered lines are excluded from an
   * open-backlog export, so any count here would read as zero on every project.
   */
  readonly itemsDelivered: MaybeDto<number>
}

export interface DashboardProjectCardDto {
  readonly id: string
  readonly salesOrderNo: string
  readonly displayName: string
  readonly projectCode: MaybeDto<string>
  readonly customerPoNo: MaybeDto<string>
  /** Display name only — decision D2. No employee email, phone or id exists in the model. */
  readonly projectManager: MaybeDto<string>
  readonly orderedOn: MaybeDto<string>
  readonly contractualDate: MaybeDto<string>
  readonly schedule: MaybeDto<ScheduleDto>
  readonly progress: ProgressDto
  readonly itemCount: number
  readonly nextMilestone: MaybeDto<NextMilestoneDto>
  readonly attention: {
    readonly awaitingCustomer: number
    readonly pastContractualDate: boolean
  }
  /** Present when at least one item is waiting on this customer. */
  readonly blockedExample: MaybeDto<BlockedOnCustomerDto>
}

export interface NextMilestoneDto {
  readonly stage: StageIdDto
  readonly key: string
  readonly plannedOn: MaybeDto<string>
}
