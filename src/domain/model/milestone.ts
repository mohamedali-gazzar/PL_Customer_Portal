import type { Maybe } from './maybe'
import type { PlainDate } from './plain-date'

/** The 7 company-wide stages from PDF §4. Order is significant. */
export type StageId = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const STAGE_IDS: readonly StageId[] = [1, 2, 3, 4, 5, 6, 7] as const

export const STAGE_KEYS = {
  1: 'drawings_approval',
  2: 'material_readiness',
  3: 'manufacturing',
  4: 'fat',
  5: 'pre_delivery_payment',
  6: 'delivery_readiness',
  7: 'financial_clearance',
} as const satisfies Record<StageId, string>

export type StageKey = (typeof STAGE_KEYS)[StageId]

/**
 * The exact status vocabulary of PDF §4 — no additions, no renames. Rework
 * statuses live on stage 4, as in the brief.
 */
export const STAGE_STATUSES = {
  1: ['under_preparation', 'sent_for_approval', 'approved'],
  2: ['material_not_available', 'partially_available', 'fully_available'],
  3: ['not_started', 'in_progress', 'completed'],
  4: ['not_ready', 'fat_invitation', 'fat_success', 'rework_in_progress', 'rework_done'],
  5: ['not_ready', 'delivery_payment_due', 'paid'],
  6: ['not_ready', 'ready', 'delivered'],
  7: ['waiting_for_invoice', 'invoice_submitted', 'not_paid', 'paid'],
} as const satisfies Record<StageId, readonly string[]>

export type StatusOf<S extends StageId> = (typeof STAGE_STATUSES)[S][number]
export type MilestoneStatus = StatusOf<StageId>

/**
 * How a status was arrived at. This is what lets the portal be both faithful to
 * PDF §4 and honest about the temporary source.
 *
 * - `evidence`    a source document drove it (the normal case)
 * - `default`     no event yet, so §4's documented default applies
 * - `partial`     the status is derivable but its *completion* evidence is not
 *                 available from this provider (e.g. stage 4 without Stock Entry:
 *                 we can say an invitation is due, never that FAT passed)
 * - `unavailable` this provider cannot derive the stage at all; status is unknown
 */
export type MilestoneDerivation = 'evidence' | 'default' | 'partial' | 'unavailable'

/** Which source field produced each date, for audit and for UI tooltips. */
export interface MilestoneProvenance {
  readonly status?: string
  readonly plannedStart?: string
  readonly plannedEnd?: string
  readonly actualStart?: string
  readonly actualEnd?: string
}

export interface Milestone {
  readonly stage: StageId
  readonly key: StageKey
  readonly status: Maybe<MilestoneStatus>
  readonly derivation: MilestoneDerivation
  readonly plannedStart: Maybe<PlainDate>
  readonly plannedEnd: Maybe<PlainDate>
  readonly actualStart: Maybe<PlainDate>
  readonly actualEnd: Maybe<PlainDate>
  /**
   * Actual end minus planned end, in days. Positive means late.
   * Known only when both ends are known — never estimated.
   */
  readonly varianceDays: Maybe<number>
  readonly provenance: MilestoneProvenance
  /** True once the stage's own completion condition is satisfied by evidence. */
  readonly isComplete: boolean
}

export type MilestoneSet = Readonly<Record<StageId, Milestone>>

/** Stage completion, used for progress weighting. */
export function stageFraction(m: Milestone): number {
  if (m.isComplete) return 1
  if (m.status.state !== 'known') return 0
  switch (m.status.value) {
    case 'sent_for_approval':
    case 'partially_available':
    case 'in_progress':
    case 'fat_invitation':
    case 'rework_in_progress':
    case 'delivery_payment_due':
    case 'ready':
    case 'invoice_submitted':
    case 'not_paid':
      return 0.5
    default:
      return 0
  }
}
