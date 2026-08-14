import {
  isKnown,
  STAGE_IDS,
  type DataSourceInfo,
  type ItemTimeline,
  type Maybe,
  type Milestone,
  type PlainDate,
  type ProviderCapabilities,
  type StageId,
} from '@/domain'
import type { ProjectProgress } from '@/domain'
import type { ScheduleStatus } from '@/domain'
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

/** The single conversion from a domain `Maybe` to the wire form. */
export function toMaybeDto<T>(maybe: Maybe<T>): MaybeDto<T> {
  return isKnown(maybe) ? { known: true, value: maybe.value } : { known: false, reason: maybe.reason }
}

/**
 * Map a `Maybe<T>` through a transform.
 *
 * Note what is *not* forwarded: `Unknown.note`. Those notes are operator-facing
 * and name ERPNext fields, so they stay server-side; the browser gets the machine
 * `reason` and, where a message is needed, an i18n code.
 */
export function mapMaybeDto<T, U>(maybe: Maybe<T>, f: (value: T) => U): MaybeDto<U> {
  return isKnown(maybe) ? { known: true, value: f(maybe.value) } : { known: false, reason: maybe.reason }
}

export function dateDto(maybe: Maybe<PlainDate>): MaybeDto<string> {
  return mapMaybeDto(maybe, (d) => d as string)
}

export function toDataSourceDto(info: DataSourceInfo): DataSourceDto {
  return {
    providerId: info.providerId,
    asOf: dateDto(info.asOf),
    isLive: info.isLive,
    caveat: isKnown(info.scopeCaveat)
      ? { known: true, value: 'source.open_backlog_only' }
      : { known: false, reason: 'not_applicable' },
  }
}

export function toMilestoneDto(milestone: Milestone, capabilities: ProviderCapabilities): MilestoneDto {
  return {
    stage: milestone.stage as StageIdDto,
    key: milestone.key,
    status: toMaybeDto(milestone.status),
    plannedStart: dateDto(milestone.plannedStart),
    plannedEnd: dateDto(milestone.plannedEnd),
    actualStart: dateDto(milestone.actualStart),
    actualEnd: dateDto(milestone.actualEnd),
    varianceDays: toMaybeDto(milestone.varianceDays),
    isComplete: milestone.isComplete,
    // A `partial` stage is derivable but its completion is not observable here.
    outcomeObservable: milestone.derivation !== 'partial' && milestone.derivation !== 'unavailable',
    actualStartBasis:
      milestone.stage !== 3
        ? 'none'
        : capabilities.actualManufacturingStart
          ? 'actual_start_date'
          : isKnown(milestone.actualStart)
            ? 'material_ready_proxy'
            : 'none',
  }
}

export function toMilestoneDtos(
  timeline: ItemTimeline,
  capabilities: ProviderCapabilities,
): readonly MilestoneDto[] {
  return STAGE_IDS.map((stage: StageId) => toMilestoneDto(timeline.milestones[stage], capabilities))
}

export function toProgressDto(progress: ProjectProgress): ProgressDto {
  return {
    percent: toMaybeDto(progress.percent),
    basis: progress.basis as readonly StageIdDto[],
    linesCounted: progress.linesCounted,
    linesTotal: progress.linesTotal,
  }
}

export function toItemProgressDto(timeline: ItemTimeline): ProgressDto {
  return {
    percent: toMaybeDto(timeline.progressPercent),
    basis: timeline.progressBasis as readonly StageIdDto[],
    linesCounted: 1,
    linesTotal: 1,
  }
}

export function toScheduleDto(schedule: Maybe<ScheduleStatus>): MaybeDto<ScheduleDto> {
  return mapMaybeDto(schedule, (s) => ({
    state: s.state,
    contractualDate: s.contractualDate as string,
    daysToContractual: s.daysToContractual,
  }))
}

export function toBlockedDto(timeline: ItemTimeline): MaybeDto<BlockedOnCustomerDto> {
  return mapMaybeDto(timeline.blockedOnCustomer, (b) => ({
    reason: b.reason,
    sinceDays: toMaybeDto(b.sinceDays),
    since: dateDto(b.since),
  }))
}

/**
 * The honest-empty-state descriptors for a screen, derived from capabilities.
 *
 * Built from declared capability flags, never from "the array came back empty",
 * so an outage can never be mistaken for "you have no invoices".
 */
export function unavailabilityFor(capabilities: ProviderCapabilities): {
  finance: UnavailabilityDto | null
  documents: UnavailabilityDto | null
  delivery: UnavailabilityDto | null
  fat: UnavailabilityDto | null
  plannedDates: UnavailabilityDto | null
} {
  const anyPlannedDateMissing = Object.values(capabilities.plannedDates).some((v) => v === false)
  return {
    finance: capabilities.finance === false ? { code: 'source.no_finance_data', scope: 'finance' } : null,
    documents: capabilities.documents ? null : { code: 'source.no_document_data', scope: 'documents' },
    delivery: capabilities.deliveryEvents ? null : { code: 'source.no_delivery_data', scope: 'delivery' },
    fat: capabilities.fatEvents ? null : { code: 'source.no_fat_outcome_data', scope: 'fat' },
    plannedDates: anyPlannedDateMissing ? { code: 'source.no_planned_dates', scope: 'planned_dates' } : null,
  }
}
