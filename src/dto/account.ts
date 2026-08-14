import type { DataSourceDto, UnavailabilityDto } from './common'

export interface AccountContextDto {
  readonly source: DataSourceDto
  readonly customer: { readonly displayName: string }
  readonly unavailable: {
    readonly finance: UnavailabilityDto | null
    readonly documents: UnavailabilityDto | null
    readonly delivery: UnavailabilityDto | null
    readonly plannedDates: UnavailabilityDto | null
  }
}
