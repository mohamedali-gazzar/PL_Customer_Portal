import type { MilestoneDto, StageIdDto } from '@/dto/common'
import type { MessageKey, Translate } from '@/ui/i18n/messages'
import { cn } from '@/ui/cn'
import { segmentState, statusText, type SegmentState } from './stage-state'
import s from './stage-rail.module.css'


const STATE_CLASS: Record<SegmentState, string | undefined> = {
  complete: s.complete,
  active: s.active,
  pending: s.pending,
  void: s.void,
  notApplicable: s.notApplicable,
}

export function StageRail({
  milestones,
  currentStage,
  t,
  compact = false,
  withNames = false,
}: {
  milestones: readonly MilestoneDto[]
  currentStage: StageIdDto | null
  t: Translate
  compact?: boolean
  withNames?: boolean
}) {
  return (
    <div className={compact ? s.compact : undefined}>
      <ol className={s.rail} aria-label={t('a11y.stageRail')}>
        {milestones.map((milestone) => {
          const state = segmentState(milestone, currentStage)
          return (
            <li
              key={milestone.stage}
              className={cn(s.seg, STATE_CLASS[state])}
              /*
               * The title is a convenience, not the only route to the information:
               * the same status text appears as the row's status chip and in the
               * expandable stage table, because hover-only content is unreachable on
               * touch and to screen readers.
               */
              title={`${milestone.stage}. ${t(`stage.${milestone.stage}` as MessageKey)} — ${statusText(milestone, t)}`}
            >
              {state === 'complete' ? (
                <svg className={s.check} viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2.5 6.4l2.4 2.4 4.6-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : state === 'void' ? (
                '?'
              ) : (
                milestone.stage
              )}
              <span className="sr-only">
                {t(`stage.${milestone.stage}` as MessageKey)}: {statusText(milestone, t)}
              </span>
            </li>
          )
        })}
      </ol>

      {withNames && (
        <div className={s.names} aria-hidden="true">
          {milestones.map((m) => (
            <span key={m.stage} className={s.name}>
              {t(`stage.short.${m.stage}` as MessageKey)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}


export function StageRailLegend({ t }: { t: Translate }) {
  const items: { state: SegmentState; label: string }[] = [
    { state: 'complete', label: t('status.completed') },
    { state: 'active', label: t('status.in_progress') },
    { state: 'pending', label: t('unknown.pending') },
    { state: 'void', label: t('unavailable.stageTitle') },
  ]
  return (
    <ul className={s.legend}>
      {items.map((item) => (
        <li key={item.state} className={s.legendItem}>
          <span className={cn(s.swatch, STATE_CLASS[item.state])} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export { segmentState, statusText } from './stage-state'
export type { SegmentState } from './stage-state'
