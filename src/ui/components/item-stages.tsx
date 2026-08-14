import type { MaybeDto, MilestoneDto } from '@/dto/common'
import type { ProjectItemDto } from '@/dto/project-detail'
import { formatDate, type Locale } from '@/ui/i18n/locale'
import { pluralizer, type MessageKey, type Translate } from '@/ui/i18n/messages'
import { Badge, Value } from './primitives'
import { segmentState, StageRail, statusText } from './stage-rail'
import { cn } from '@/ui/cn'
import s from './item-stages.module.css'

/**
 * The default project-detail view: one row per item, with the stage-by-stage detail
 * for the selected item expanded inline.
 *
 * Two departures from the mockup, both deliberate.
 *
 * *Status first, schedule second.* The mockup puts a time-scaled chart on every row.
 * With this source that chart is mostly empty, and the largest order in the export has
 * 26 items — so the list leads with the state of each item and the Timeline tab carries
 * the schedule.
 *
 * *Expansion is a URL, not a `<details>`.* The obvious implementation keeps every
 * item's detail table in the DOM and hides it with CSS. On the 27-item order that made
 * the page 2 MB — 1.7 MB of it Next's client-navigation payload, which scales with
 * element count — for content nobody had asked to see. Selecting an item is instead a
 * plain link that re-renders server-side from the already-cached read model: page
 * weight stops growing with item count, the expanded item is deep-linkable and
 * shareable, and it still needs no client JavaScript.
 */
export function ItemStageList({
  items,
  locale,
  t,
  baseHref,
  expandedItemId,
}: {
  items: readonly ProjectItemDto[]
  locale: Locale
  t: Translate
  /** Project URL without search parameters. */
  baseHref: string
  expandedItemId: string | null
}) {
  return (
    <div className={s.list}>
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          locale={locale}
          t={t}
          baseHref={baseHref}
          expanded={item.id === expandedItemId}
        />
      ))}
    </div>
  )
}

function ItemRow({
  item,
  locale,
  t,
  baseHref,
  expanded,
}: {
  item: ProjectItemDto
  locale: Locale
  t: Translate
  baseHref: string
  expanded: boolean
}) {
  const currentStage = item.currentStage.known ? item.currentStage.value : null
  const currentMilestone =
    currentStage === null ? undefined : item.milestones.find((m) => m.stage === currentStage)
  // Selecting the open item again closes it, so the control is a real toggle.
  const href = expanded
    ? `${baseHref}#${item.id}`
    : `${baseHref}?item=${encodeURIComponent(item.id)}#${item.id}`

  return (
    <div className={cn(s.item, expanded && s.itemOpen)} id={item.id}>
      <a className={s.summary} href={href} aria-expanded={expanded}>
        <span className={s.nameCell}>
          <span className={s.itemName}>
            <bdi>{item.itemName}</bdi>
          </span>
          <span className={s.itemMeta}>
            {item.itemCode.known && <span className={cn(s.itemCode, 'ltr-num')}>{item.itemCode.value}</span>}
            <span>
              {t('item.quantity')}: <span className="ltr-num">{item.quantity.ordered}</span>
            </span>
            {item.itemClass === 'supplied_component' && <Badge tone="void">{t('item.componentBadge')}</Badge>}
          </span>
        </span>

        <span className={s.railCell}>
          <StageRail milestones={item.milestones} currentStage={currentStage} t={t} withNames />
        </span>

        <span className={s.statusCell}>
          {item.hasProductionJourney ? (
            <>
              <span className={s.statusText}>
                {currentMilestone === undefined ? t('unknown.pending') : statusText(currentMilestone, t)}
              </span>
              {item.blockedOnCustomer.known ? (
                <Badge tone="accent" dot>
                  {t('status.sent_for_approval')}
                </Badge>
              ) : (
                item.nextMilestone.known && (
                  <span className={s.nextLine}>
                    {t('project.nextMilestone')}: {t(`stage.${item.nextMilestone.value.stage}` as MessageKey)}
                    {item.nextMilestone.value.plannedOn.known
                      ? ` · ${formatDate(locale, item.nextMilestone.value.plannedOn.value)}`
                      : ''}
                  </span>
                )
              )}
            </>
          ) : (
            <span className={s.nextLine}>{t('item.noJourney')}</span>
          )}
        </span>

        <span className={s.chevWrap}>
          <svg className={cn(s.chev, expanded && s.chevOpen)} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M5.5 8l4.5 4.5L14.5 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sr-only">{expanded ? t('item.hideDetail') : t('item.showDetail')}</span>
        </span>
      </a>

      {expanded && (
        <div className={s.detail}>
          <dl className={s.detailFacts}>
            <Fact label={t('item.quantity')} value={String(item.quantity.ordered)} />
            <FactMaybe label={t('item.produced')} value={item.quantity.produced} t={t} />
            <FactMaybe label={t('item.remaining')} value={item.quantity.remaining} t={t} />
            <FactMaybe label={t('item.cubicles')} value={item.cubicles} t={t} />
            <FactMaybe label={t('item.code')} value={item.itemCode} t={t} />
          </dl>

          {item.hasProductionJourney ? (
            <StageTable item={item} locale={locale} t={t} />
          ) : (
            <p className={s.noJourney}>{t('item.noJourney')}</p>
          )}
        </div>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={s.dateSmall}>{label}</dt>
      <dd className={s.statusText}>
        <span className="ltr-num">{value}</span>
      </dd>
    </div>
  )
}

function FactMaybe({ label, value, t }: { label: string; value: MaybeDto<string | number>; t: Translate }) {
  return (
    <div>
      <dt className={s.dateSmall}>{label}</dt>
      <dd className={s.statusText}>
        <Value value={value} t={t} />
      </dd>
    </div>
  )
}

/**
 * The authoritative per-stage view: status, planned, actual, variance, and — where a
 * date was derived rather than read directly — the basis for it.
 *
 * No cell is ever blank. A stage the source cannot derive collapses to one explanatory
 * cell rather than four repetitions of the same "not in this data source", which is
 * both quieter to read and materially smaller to ship.
 */
function StageTable({ item, locale, t }: { item: ProjectItemDto; locale: Locale; t: Translate }) {
  const currentStage = item.currentStage.known ? item.currentStage.value : null

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">{t('table.stage')}</th>
            <th scope="col">{t('table.status')}</th>
            <th scope="col">{t('table.planned')}</th>
            <th scope="col">{t('table.actual')}</th>
            <th scope="col">{t('table.variance')}</th>
          </tr>
        </thead>
        <tbody>
          {item.milestones.map((m) => {
            const state = segmentState(m, currentStage)
            const undecidable = state === 'void' || state === 'notApplicable'
            return (
              <tr key={m.stage} className={cn(undecidable && s.rowVoid)}>
                <th scope="row" className={s.stageCell}>
                  <span className={s.stageNo} aria-hidden="true">
                    {m.stage}
                  </span>
                  {t(`stage.${m.stage}` as MessageKey)}
                </th>
                {undecidable ? (
                  <td colSpan={4} className={s.dateCell}>
                    <Badge tone="void">{statusText(m, t)}</Badge>{' '}
                    <span className={s.basisNote}>{t('unavailable.rowExplained')}</span>
                  </td>
                ) : (
                  <>
                    <td>
                      <span className={s.statusText}>{statusText(m, t)}</span>
                      {/*
                       * A stage the source can position but not conclude — stage 4
                       * without Stock Entry data. A short chip on the row; the full
                       * explanation sits in the panel below the table, once.
                       */}
                      {!m.outcomeObservable && (
                        <span className={s.chipLine}>
                          <Badge tone="void">{t('unavailable.outcomeNotRecorded')}</Badge>
                        </span>
                      )}
                    </td>
                    <td className={s.dateCell}>
                      <DatePair start={m.plannedStart} end={m.plannedEnd} locale={locale} t={t} />
                    </td>
                    <td className={s.dateCell}>
                      <DatePair start={m.actualStart} end={m.actualEnd} locale={locale} t={t} />
                      {m.actualStartBasis !== 'none' && m.actualStart.known && (
                        <span className={s.basisNote}>{t(`basis.${m.actualStartBasis}` as MessageKey)}</span>
                      )}
                    </td>
                    <td>
                      <VarianceCell milestone={m} t={t} locale={locale} />
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DatePair({
  start,
  end,
  locale,
  t,
}: {
  start: MilestoneDto['plannedStart']
  end: MilestoneDto['plannedEnd']
  locale: Locale
  t: Translate
}) {
  if (!start.known && !end.known) return <Value value={end} t={t} />
  return (
    <span className={s.dateRange}>
      {start.known && (
        <span className={s.dateSmall}>
          {t('table.started')}: <span className="ltr-num">{formatDate(locale, start.value)}</span>
        </span>
      )}
      {end.known ? <span className="ltr-num">{formatDate(locale, end.value)}</span> : <Value value={end} t={t} />}
    </span>
  )
}

function VarianceCell({ milestone, t, locale }: { milestone: MilestoneDto; t: Translate; locale: Locale }) {
  if (!milestone.varianceDays.known) return <Value value={milestone.varianceDays} t={t} />
  const tp = pluralizer(locale)
  const days = milestone.varianceDays.value
  if (days === 0) return <span className={s.onTime}>{t('variance.onTime')}</span>
  return days > 0 ? (
    <span className={s.late}>{tp('variance.late', days)}</span>
  ) : (
    <span className={s.early}>{tp('variance.early', Math.abs(days))}</span>
  )
}
