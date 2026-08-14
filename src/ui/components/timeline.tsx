import type { StageIdDto } from '@/dto/common'
import type { ProjectItemDto } from '@/dto/project-detail'
import { formatDate, formatMonthYear, type Locale } from '@/ui/i18n/locale'
import { pluralizer, type MessageKey, type Translate } from '@/ui/i18n/messages'
import { cn } from '@/ui/cn'
import {
  allDatesOf,
  makeScale,
  monthTicks,
  plotItem,
  STAGE_TINT,
} from './timeline-scale'
import s from './timeline.module.css'

/* ── Component ──────────────────────────────────────────────────────── */

export function ItemTimeline({
  items,
  today,
  locale,
  t,
}: {
  items: readonly ProjectItemDto[]
  today: string
  locale: Locale
  t: Translate
}) {
  const tp = pluralizer(locale)
  const scale = makeScale(allDatesOf(items), today)
  if (scale === null) return null

  const ticks = monthTicks(scale)
  const todayPct = scale.pct(today)
  const plots = items.map((item) => ({ item, plot: plotItem(item, scale) }))

  return (
    <>
      <div className={s.chart}>
        <div className={s.inner}>
          <div className={s.head}>
            <div className={s.headLabel}>{t('item.itemsHeading')}</div>
            <div className={s.axis}>
              {ticks.map((tick) => (
                <span key={tick} className={s.tick} style={{ insetInlineStart: `${scale.pct(tick)}%` }}>
                  {formatMonthYear(locale, tick)}
                </span>
              ))}
            </div>
          </div>

          <div className={s.body}>
            <div className={s.labels}>
              {plots.map(({ item }) => (
                <div key={item.id} className={s.label}>
                  <span className={s.labelName} title={item.itemName}>
                    <bdi>{item.itemName}</bdi>
                  </span>
                  <span className={s.labelMeta}>
                    {t('item.quantity')}: <span className="ltr-num">{item.quantity.ordered}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className={s.plotWrap}>
              <div className={s.overlay} aria-hidden="true">
                {ticks.map((tick) => (
                  <span key={tick} className={s.grid} style={{ insetInlineStart: `${scale.pct(tick)}%` }} />
                ))}
                <span className={s.today} style={{ insetInlineStart: `${todayPct}%` }}>
                  <span className={s.todayLabel}>{t('timeline.today')}</span>
                </span>
              </div>

              <div className={s.rows}>
                {plots.map(({ item, plot }) => (
                  <div key={item.id} className={s.row}>
                    {plot.isEmpty ? (
                      <span className={s.rowEmpty}>{t('timeline.noDates')}</span>
                    ) : (
                      <>
                        <div className={cn(s.lane, s.lanePlanned)}>
                          <span className={s.laneTag}>{t('timeline.planned')}</span>
                          {plot.plannedSpans.map((sp) => (
                            <span
                              key={`ps-${sp.stage}`}
                              className={s.plannedSpan}
                              style={{ insetInlineStart: `${sp.fromPct}%`, width: `${sp.widthPct}%` }}
                              title={label(t, sp.stage, `${formatDate(locale, sp.from)} → ${formatDate(locale, sp.to)}`)}
                            />
                          ))}
                          {plot.plannedMarkers.map((mk) => (
                            <span
                              key={`pm-${mk.stage}`}
                              className={s.plannedMark}
                              style={{ insetInlineStart: `${mk.pct}%` }}
                              title={label(t, mk.stage, `${t('timeline.planned')} ${formatDate(locale, mk.date)}`)}
                            />
                          ))}
                        </div>

                        <div className={cn(s.lane, s.laneActual)}>
                          <span className={s.laneTag}>{t('timeline.actual')}</span>
                          {plot.actualSpans.map((sp) => (
                            <span
                              key={`as-${sp.stage}`}
                              className={s.actualSpan}
                              style={{
                                insetInlineStart: `${sp.fromPct}%`,
                                width: `${sp.widthPct}%`,
                                ['--tint' as string]: STAGE_TINT[sp.stage],
                              }}
                              title={label(t, sp.stage, `${formatDate(locale, sp.from)} → ${formatDate(locale, sp.to)}`)}
                            />
                          ))}
                          {plot.delays.map((dl) => (
                            <span
                              key={`dl-${dl.stage}`}
                              className={s.delay}
                              style={{ insetInlineStart: `${dl.fromPct}%`, width: `${dl.widthPct}%` }}
                              title={label(t, dl.stage, tp('variance.late', dl.days))}
                            />
                          ))}
                          {plot.actualMarkers.map((mk) => (
                            <span
                              key={`am-${mk.stage}`}
                              className={s.actualMark}
                              style={{ insetInlineStart: `${mk.pct}%`, ['--tint' as string]: STAGE_TINT[mk.stage] }}
                              title={label(t, mk.stage, formatDate(locale, mk.date))}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={s.legend}>
            <span className={s.legendItem}>
              <span className={s.legendDiamond} aria-hidden="true" />
              {t('timeline.legendPlanned')}
            </span>
            <span className={s.legendItem}>
              <span className={s.legendBar} aria-hidden="true" />
              {t('timeline.legendActual')}
            </span>
            <span className={s.legendItem}>
              <span className={s.legendDelay} aria-hidden="true" />
              {t('timeline.legendDelay')}
            </span>
            <span className={s.legendItem}>
              <span className={s.legendToday} aria-hidden="true" />
              {t('timeline.today')}
            </span>
          </div>
        </div>
      </div>

      {/*
       * The chart's own caveat, stated next to it rather than buried in a tooltip:
       * the planned lane is markers because no planned start date exists in this
       * source. A reader must not assume the missing bars mean "no plan".
       */}
      <p className={s.note}>{t('timeline.plannedNote')}</p>
    </>
  )
}



function label(t: Translate, stage: StageIdDto, detail: string): string {
  return `${stage}. ${t(`stage.${stage}` as MessageKey)} — ${detail}`
}

export { hasPlottableDates } from './timeline-scale'
