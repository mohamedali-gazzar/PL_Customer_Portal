import type { MilestoneDto, StageIdDto } from '@/dto/common'
import type { MessageKey, Translate } from '@/ui/i18n/messages'

/**
 * Pure presentation logic for the stage rail, kept out of the `.tsx` so it can be
 * unit-tested. (Node's native TypeScript execution strips types but does not
 * transform JSX, so a `.tsx` file cannot be imported by the test runner. Keeping the
 * decisions here and the markup there is better separation regardless.)
 */

export type SegmentState = 'complete' | 'active' | 'pending' | 'void' | 'notApplicable'

/**
 * Which of the four visual states a milestone is in.
 *
 * The distinction that carries the most weight: a milestone whose status is *unknown*
 * is `void` ("cannot be shown"), while one with a known status that has simply not
 * started is `pending` ("not yet"). Collapsing them would let the portal imply that a
 * factory test or a payment had not happened when the source has no record either
 * way — the exact failure this codebase exists to prevent.
 */
export function segmentState(milestone: MilestoneDto, currentStage: StageIdDto | null): SegmentState {
  if (!milestone.status.known) {
    return milestone.status.reason === 'not_applicable' ? 'notApplicable' : 'void'
  }
  if (milestone.isComplete) return 'complete'
  if (currentStage !== null && milestone.stage === currentStage) return 'active'
  return 'pending'
}

/** Status text, falling back to the reason the status is unknown. Never blank. */
export function statusText(milestone: MilestoneDto, t: Translate): string {
  if (milestone.status.known) return t(`status.${milestone.status.value}` as MessageKey)
  return milestone.status.reason === 'not_applicable'
    ? t('unknown.not_applicable')
    : t('unavailable.stageTitle')
}

/**
 * A stage range for display, e.g. "1–3" or "1, 3".
 *
 * Always rendered next to a percentage, so a reader knows what the number covers.
 */
export function formatStageRange(basis: readonly StageIdDto[]): string {
  if (basis.length === 0) return '—'
  const sorted = [...basis].sort((a, b) => a - b)
  const contiguous = sorted.every((v, i) => i === 0 || v === (sorted[i - 1] ?? 0) + 1)
  return contiguous && sorted.length > 1 ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(', ')
}
