import type {
  BlockedOnCustomerDto,
  DataSourceDto,
  MaybeDto,
  MilestoneDto,
  ProgressDto,
  ScheduleDto,
  StageIdDto,
  UnavailabilityDto,
} from './common'

/**
 * Project detail payload, including the item timelines.
 *
 * Mockup 2's header carries SO number, PO, contract value, contractual delivery
 * date and PM. PO and contract value are not in the temporary source, so they are
 * `MaybeDto` and render as "not available" rather than blank or zero.
 *
 * One request returns the project, every item and every item's full 7-stage
 * timeline. The browser makes no follow-up call per item — PDF §3's rule that the
 * portal never orchestrates backend calls applies to the portal's own API too, and
 * it is what keeps the ERPNext call count flat as items grow.
 */
export interface ProjectDetailDto {
  readonly source: DataSourceDto
  /** The customer's own name, for the header account chip. Never another tenant's. */
  readonly customer: { readonly displayName: string }
  readonly project: ProjectHeaderDto
  readonly items: readonly ProjectItemDto[]
  readonly unavailable: {
    readonly finance: UnavailabilityDto | null
    readonly documents: UnavailabilityDto | null
    readonly delivery: UnavailabilityDto | null
    readonly fat: UnavailabilityDto | null
    readonly plannedDates: UnavailabilityDto | null
  }
}

export interface ProjectHeaderDto {
  readonly id: string
  readonly salesOrderNo: string
  readonly displayName: string
  readonly projectCode: MaybeDto<string>
  readonly customerPoNo: MaybeDto<string>
  readonly orderedOn: MaybeDto<string>
  readonly contractualPeriodDays: MaybeDto<number>
  readonly contractualDate: MaybeDto<string>
  readonly schedule: MaybeDto<ScheduleDto>
  readonly projectManager: MaybeDto<string>
  readonly progress: ProgressDto
  readonly itemCounts: {
    readonly total: number
    readonly manufactured: number
    readonly suppliedComponents: number
    readonly delivered: MaybeDto<number>
  }
  readonly attention: {
    readonly awaitingCustomer: number
    readonly pastContractualDate: boolean
  }
}

export interface ProjectItemDto {
  readonly id: string
  /**
   * Item code, and only for manufactured panels.
   *
   * Suppressed on supplied-component lines: those codes are supplier part numbers
   * (e.g. ABB `1SDA066317R1`), and PDF §7.3 forbids supplier data reaching the
   * portal. Pending the open decision on how component lines should appear, the
   * conservative choice is to show the description only.
   */
  readonly itemCode: MaybeDto<string>
  readonly itemName: string
  readonly itemClass: 'manufactured' | 'supplied_component' | 'unknown'
  /** False for lines with no work order — the 7-stage tracker does not apply. */
  readonly hasProductionJourney: boolean
  readonly quantity: {
    readonly ordered: number
    readonly remaining: MaybeDto<number>
    readonly produced: MaybeDto<number>
  }
  /** Absent from the temporary source; shown in mockup 2. */
  readonly cubicles: MaybeDto<number>
  readonly currentStage: MaybeDto<StageIdDto>
  readonly progress: ProgressDto
  readonly nextMilestone: MaybeDto<{ readonly stage: StageIdDto; readonly key: string; readonly plannedOn: MaybeDto<string> }>
  readonly blockedOnCustomer: MaybeDto<BlockedOnCustomerDto>
  /** All 7, in order. Unavailable stages carry their reason. */
  readonly milestones: readonly MilestoneDto[]
}
