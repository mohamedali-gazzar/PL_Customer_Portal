/**
 * Customer-facing wire types.
 *
 * These are hand-written whitelists, not derived from the domain entities. That is
 * deliberate: a mapped or inferred DTO would silently gain any field added to the
 * domain later, which is exactly how cost, margin and rework fields leak. Adding a
 * field to a customer response has to be a conscious edit in this folder, and
 * `tests/security/dto-blacklist.test.ts` scans every composed response for
 * forbidden keys.
 *
 * Nothing here is optional-by-omission. Anything the source cannot supply is a
 * `MaybeDto` carrying the reason, so the UI can say why instead of showing a zero.
 */

import type { UnknownReason } from '@/domain'

export type MaybeDto<T> =
  | { readonly known: true; readonly value: T }
  | { readonly known: false; readonly reason: UnknownReason }

/**
 * An i18n message code for an honest empty state, plus what it applies to.
 *
 * A code rather than a sentence: the UI is bilingual (EN/AR), and the copy for
 * "we cannot show your invoices because the temporary data source has none" must
 * be translatable and reviewable by the business, not embedded in a provider.
 */
export interface UnavailabilityDto {
  readonly code: UnavailabilityCode
  readonly scope: 'finance' | 'documents' | 'delivery' | 'fat' | 'planned_dates' | 'identity'
}

export type UnavailabilityCode =
  | 'source.no_finance_data'
  | 'source.no_document_data'
  | 'source.no_delivery_data'
  | 'source.no_fat_outcome_data'
  | 'source.no_planned_dates'
  | 'source.open_backlog_only'
  | 'source.provisional_identity'

export interface DataSourceDto {
  readonly providerId: string
  readonly asOf: MaybeDto<string>
  readonly isLive: boolean
  /** Rendered as a persistent banner while a snapshot source is active. */
  readonly caveat: MaybeDto<UnavailabilityCode>
}

export type StageIdDto = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * One stage on the item timeline.
 *
 * `provenance` from the domain is intentionally not forwarded: it names ERPNext
 * fields, which is internal schema detail. The two things the UI legitimately
 * needs from it are reduced to safe enums — `actualStartBasis` (so a derived start
 * date can be labelled as such) and `outcomeObservable` (so a stage whose result
 * this source cannot see is not drawn as if it had finished).
 */
export interface MilestoneDto {
  readonly stage: StageIdDto
  readonly key: string
  readonly status: MaybeDto<string>
  readonly plannedStart: MaybeDto<string>
  readonly plannedEnd: MaybeDto<string>
  readonly actualStart: MaybeDto<string>
  readonly actualEnd: MaybeDto<string>
  readonly varianceDays: MaybeDto<number>
  readonly isComplete: boolean
  /** False when the source cannot observe this stage's completion (e.g. FAT). */
  readonly outcomeObservable: boolean
  readonly actualStartBasis: 'actual_start_date' | 'material_ready_proxy' | 'none'
}

export interface ProgressDto {
  readonly percent: MaybeDto<number>
  /**
   * The stages the percentage covers. The UI must render it as "x% of stages
   * 1–3" — a bare "x% complete" would imply all seven, three of which this
   * source cannot see.
   */
  readonly basis: readonly StageIdDto[]
  readonly linesCounted: number
  readonly linesTotal: number
}

export interface ScheduleDto {
  /** Never "late": this source cannot observe delivery, only the calendar. */
  readonly state: 'on_track' | 'due_soon' | 'past_contractual_date'
  readonly contractualDate: string
  readonly daysToContractual: number
}

export interface BlockedOnCustomerDto {
  readonly reason: 'drawing_approval'
  readonly sinceDays: MaybeDto<number>
  readonly since: MaybeDto<string>
}
