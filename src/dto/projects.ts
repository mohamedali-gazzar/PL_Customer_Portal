import type { DataSourceDto, MaybeDto, ProgressDto, ScheduleDto, UnavailabilityDto } from './common'

/**
 * Projects list payload.
 *
 * Lives here with the other wire types rather than beside its composer, so the UI
 * layer depends only on `@/dto` and can never reach into the application layer.
 */
export interface ProjectsListDto {
  readonly source: DataSourceDto
  readonly customer: { readonly displayName: string }
  readonly projects: readonly ProjectListItemDto[]
  readonly unavailable: {
    readonly finance: UnavailabilityDto | null
    readonly delivery: UnavailabilityDto | null
  }
}

export interface ProjectListItemDto {
  readonly id: string
  readonly salesOrderNo: string
  readonly displayName: string
  readonly projectCode: MaybeDto<string>
  readonly customerPoNo: MaybeDto<string>
  readonly projectManager: MaybeDto<string>
  readonly orderedOn: MaybeDto<string>
  readonly contractualDate: MaybeDto<string>
  readonly schedule: MaybeDto<ScheduleDto>
  readonly progress: ProgressDto
  readonly itemCount: number
  readonly awaitingCustomer: number
}
