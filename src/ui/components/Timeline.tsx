'use client'

/**
 * The item milestone timeline.
 *
 * One unbroken track per panel, from the day it was ordered to today. Every day on
 * it belongs to a named block, so there is never an unexplained gap: the stretches
 * between stages are not blanks, they are the waiting periods the business already
 * measures as T1–T8. A customer looking at a six-month bar can see *which* six
 * months, and whose they were.
 *
 * The track reveals itself on arrival through each band's own CSS entrance, so the
 * animation can never leave the chart half-drawn. An earlier version swept a
 * clip-path across it from JavaScript to support a replay control; when that control
 * was removed the sweep could be interrupted mid-flight and freeze the track at a
 * few percent revealed. CSS animations always land on their end state.
 *
 * Planned dates are drawn as markers rather than as a second bar. ERPNext stores
 * planned *end* dates and no planned starts, so a planned bar would have to invent
 * its own left edge — and an invented edge in a delay conversation is worse than
 * no edge. Where the actual run passes its marker, the overshoot is hatched red.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { CustomerItem, CustomerOrder } from '@/portal/types'
import { STATE } from '@/portal/types'
import { PHASES, PHASE_HEX, STAGE_HEX, STAGE_NAMES, STAGE_SHORT } from '@/portal/constants'
import { journeyOf, materialKeyOf, JOURNEY_HEX } from '@/portal/journey'
import { STAGES } from '@/portal/milestones'
import { buildBands, plannedForStage, type Band } from '@/portal/bands'
import { stagePosition, stagesFor } from '@/portal/milestones'
import { D, days, useFd, ICO, Pill } from '../lib/format'
import { TipHead, TipNote, TipRow, useTip } from '../lib/tooltip'
import { useLabel, useT, type Translate } from '../lib/i18n'

const DAY = 86_400_000

/** The stage a panel is sitting in — the first that is neither finished nor unavailable. */
export function currentStageOf(item: CustomerItem): number {
  const i = item.st.findIndex((x) => x[0] === STATE.none || x[0] === STATE.active)
  return i < 0 ? 6 : i
}

/* --------------------------------------------------------------- component -- */

export function Timeline({
  order,
  items,
  today,
}: {
  order: CustomerOrder
  items: readonly CustomerItem[]
  today: string
}) {
  const plotRef = useRef<HTMLDivElement | null>(null)
  const [laneWidth, setLaneWidth] = useState(900)

  /* -- the time window: every dated thing on the order, plus today ---------- */
  const window_ = useMemo(() => {
    let lo: number | null = null
    let hi: number | null = null
    const push = (s: string | null) => {
      const d = D(s)
      if (!d) return
      const t = d.getTime()
      if (lo === null || t < lo) lo = t
      if (hi === null || t > hi) hi = t
    }
    for (const it of items) {
      push(it.soDate)
      push(it.cDate)
      for (const st of it.st) {
        push(st[2])
        push(st[3])
        push(st[4])
      }
    }
    push(today)
    if (lo === null || hi === null) return null
    const pad = Math.max(6 * DAY, (hi - lo) * 0.04)
    return { lo: lo - pad, hi: hi + pad }
  }, [items, today])

  // Measure the track rather than estimating it, so a label appears exactly when
  // it fits — including after a window resize, which the prototype could not see.
  useLayoutEffect(() => {
    const node = plotRef.current
    if (!node) return
    const measure = () => setLaneWidth(node.clientWidth || 900)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  const geom = useMemo(() => {
    if (!window_) return null
    const span = window_.hi - window_.lo
    const X = (s: string | null | undefined): number => {
      const d = D(s ?? null)
      return d ? ((d.getTime() - window_.lo) / span) * 100 : 0
    }
    return { X, span, at: (f: number) => new Date(window_.lo + (span * f) / 100) }
  }, [window_])

  const px = useCallback((widthPercent: number) => (laneWidth * widthPercent) / 100, [laneWidth])

  if (!window_ || !geom) {
    return (
      <div className="card">
        <div className="tl-wrap">
          <div className="empty">No dated milestones on this order yet.</div>
        </div>
      </div>
    )
  }

  const todayX = geom.X(today)

  return (
    // Not a card any more: with the shared month scale gone there is no chrome
    // left for the outer card to hold, and the items carry their own.
    <div className="card tl-card">
      <div className="tl-wrap">
        {items.map((item, row) => (
          <ItemTrack
            key={item.id}
            item={item}
            row={row}
            today={today}
            todayX={todayX}
            X={geom.X}
            px={px}
            plotRef={row === 0 ? plotRef : undefined}
          />
        ))}

      </div>
    </div>
  )
}

/* -------------------------------------------------------------- one panel -- */

function ItemTrack({
  item,
  row,
  today,
  todayX,
  X,
  px,
  plotRef,
}: {
  item: CustomerItem
  row: number
  today: string
  todayX: number
  X: (s: string | null | undefined) => number
  px: (w: number) => number
  plotRef?: React.RefObject<HTMLDivElement | null>
}) {
  const fd = useFd()
  const bind = useTip()
  const t = useT()
  const lbl = useLabel()
  /** The other card's name, for the overlap line. */
  const stageName = (n: number) => {
    const spec = STAGES.find((x) => x.no === n)
    return spec ? lbl(spec.nameKey, spec.name) : ''
  }
  const cur = currentStageOf(item)
  const bands = useMemo(() => buildBands(item, today), [item, today])

  const materialPlan = item.st[1]![4]
  const mfgPlan = item.st[2]![4]
  const deliveryPlan = item.st[5]![4]
  /** Phase index → the target date that phase is measured against. */
  const phaseTarget: Record<number, string | null> = { 3: materialPlan, 4: mfgPlan }

  const marks: { x: number; text: string }[] = []

  return (
    <div className="tl-item">
      <div className="ti-head">
        <div style={{ minWidth: 0 }}>
          <div className="id">{item.code}</div>
          <div className="mt">
            {item.name ?? ''} · {t('item.qty', { n: item.qty })} · {item.grp ?? ''}
            {item.wo ? ` · ${item.wo}` : ''}
            {/* Where the item is, counted over the stages this item actually
                shows — a clean panel has no modification card, so "of 10" and
                "of 11" are both correct answers for different items. */}
            {` · `}
            {t('item.stageOf', {
              n: stagePosition(item.stage, item.rework > 0),
              total: stagesFor(item.rework > 0).length,
            })}
            {item.dis !== null ? ` · ${t('item.daysInStage', { n: item.dis })}` : ''}
          </div>
        </div>
        <div className="rt">
          {item.hold ? <Pill kind="warn">On hold</Pill> : null}
          <span className="ti-pct">
            <span className="tr">
              <i style={{ width: `${item.pct}%` }} />
            </span>
            <b>{item.pct}%</b>
          </span>
        </div>
      </div>

      {/* An item on hold has stopped moving, and its stage dates stopped meaning
          anything the moment it did. Saying so is more use than a timeline the
          reader would otherwise assume is still running. Spec, Delta 3. */}
      {item.hold ? (
        <div className="onhold" role="status">
          {ICO.warn} <span>{t('table.onHoldBanner')}</span>
        </div>
      ) : null}

      {/* One card per stage, its steps inside. A stage is owned by one team and
          can take several steps to clear; a flat list of steps lost which team was
          holding the work. The strip scrolls rather than wrapping, so the order
          reads straight through. */}
      <div className="journey" role="list">
        {journeyOf(item, today).map((st) => (
          <div
            key={st.n}
            role="listitem"
            className={`jst ${st.state === 'done' ? 'done' : st.state === 'active' ? 'act' : 'pend'}`}
            style={{ ['--jc' as string]: JOURNEY_HEX[st.n] }}
            {...bind(
              <>
                <TipHead swatch={JOURNEY_HEX[st.n]}>
                  {`${st.pos}. ${lbl(st.labelKey, st.label)}`}
                </TipHead>
                <TipRow label="Team" value={lbl(st.teamKey, st.team)} />
                <TipRow label="Status" value={lbl(st.statusKey, st.status)} />
                {st.from ? <TipRow label="Started" value={fd(st.from)} /> : null}
                {st.to ? <TipRow label="Finished" value={fd(st.to)} /> : null}
                {st.days !== null ? (
                  <TipRow label={st.state === 'active' ? 'Running' : 'Took'} value={`${st.days} days`} />
                ) : null}
                {st.planned ? <TipRow label="Planned by" value={fd(st.planned)} /> : null}
                {st.what ? <TipNote>{st.what}</TipNote> : null}
              </>,
            )}
          >
            <div className="jh">
              <span className="jnum">{st.pos}</span>
              <span className="jname">{lbl(st.labelKey, st.label)}</span>
            </div>
            <div className="jteam">{lbl(st.teamKey, st.team)}</div>

            <div className="jsteps">
              {/* No work order: the steps below it have no documents to date them
                  from, so the card says that rather than showing empty rows. */}
              {st.unrecorded ? (
                <div className="jstep jstep-none">
                  <span className="jdot" aria-hidden />
                  <span className="jstep-b">
                    <span className="jstep-l idle">{t('now.noProduction')}</span>
                  </span>
                </div>
              ) : null}
              {st.unrecorded ? null : st.steps.map((sp) => (
                <div
                  key={`${sp.no}-${sp.label}`}
                  /* v8 gives a step three states, not two: a step that has opened
                     and not closed is running, and reads differently from one that
                     has finished and one that has not begun. */
                  className={`jstep${sp.done ? ' on' : ''}${sp.state === 'active' ? ' run' : ''}`}
                >
                  <span className="jdot" aria-hidden />
                  <span className="jstep-b">
                    <span className="jstep-n">{sp.no}</span>
                    <span className="jstep-l">{lbl(sp.labelKey, sp.label)}</span>
                  </span>
                  {sp.note || sp.on ? (
                    <span className="jstep-d">
                      {[
                        sp.note ? lbl(materialKeyOf(sp.note), sp.note) : null,
                        sp.on ? fd(sp.on) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            {st.state === 'active' && st.days !== null ? (
              <div className="jrun">
                {st.n === 2 ? t('bar.withYou') : lbl(st.statusKey, st.status)} ·{' '}
                {t('unit.days', { n: st.days })}
              </div>
            ) : null}

            {/* v8's parallel pair. Two cards lit at once is correct, and says so:
                without the line it reads as the portal contradicting itself. */}
            {st.alongside !== undefined ? (
              <div
                className="jpar"
                {...bind(
                  <>
                    <TipHead>{ICO.info} {t('stage.parallel')}</TipHead>
                    <TipNote>{t('stage.parallelWhy')}</TipNote>
                  </>,
                )}
              >
                {t('stage.alongside', { stage: stageName(st.alongside) })}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="ti-bars">
        <div className="tl-lanes">
          <div className="tl-plot" ref={plotRef}>
            <div className="tl-clip">
              <div className="trk">
                <div className="trk-base" />

                {bands.map((band, bi) => {
                  const x0 = X(band.from)
                  const x1 = X(band.to)
                  const trueWidth = x1 - x0
                  const tiny = trueWidth < 0.35
                  const width = Math.max(0.35, trueWidth)
                  const duration = days(band.from, band.to)
                  const target = plannedForStage(band.stage, item)
                  const over = Boolean(target && band.to > target && band.from < target)
                  const name = lbl(band.labelKey, band.label)
                  const solid = over && target ? Math.max(0.35, X(target) - x0) : width
                  const room = px(solid)
                  // "Drawings Approval · with you · 6d" — the customer's own clock,
                  // named. Everything else is "<Stage> · <n>d".
                  const fullLabel = band.withYou
                    ? `${name} · ${t('bar.withYou')} · ${t('bar.d', { n: duration })}`
                    : `${name} · ${t(band.open ? 'bar.dSoFar' : 'bar.d', { n: duration })}`
                  // A clipped word is worse than no word.
                  const short = t('bar.d', { n: duration })
                  const label = room >= fullLabel.length * 6.4 + 14 ? fullLabel : room >= 46 ? short : ''
                  const isLast = bi === bands.length - 1

                  marks.push({ x: x0, text: fd(band.from) })
                  if (isLast) marks.push({ x: x1, text: band.open ? t('mark.today') : fd(band.to) })

                  const tip = (
                    <>
                      <TipHead swatch={band.family.hex}>{name}</TipHead>
                      <TipRow label="From" value={fd(band.from)} />
                      <TipRow
                        label={band.open ? 'Still going, now' : 'To'}
                        value={band.open ? t('mark.today') : fd(band.to)}
                      />
                      <TipRow label={band.open ? 'Open for' : 'Duration'} value={`${duration} days`} />
                      {band.stage <= 1 && item.nRev ? (
                        <TipRow label="Revisions" value={`${item.nRev} round${item.nRev > 1 ? 's' : ''}`} />
                      ) : null}
                      {band.open && item.step ? <TipRow label="Panel status" value={item.step} /> : null}
                      {target ? <TipRow label="Target was" value={fd(target)} /> : null}
                      {over && target ? (
                        <TipRow label="Over target by" value={`${days(target, band.to)} days`} emphasis />
                      ) : null}
                      {band.what ? <TipNote>{band.what}</TipNote> : null}
                    </>
                  )

                  return (
                    <span key={bi}>
                      <div
                        className={[
                          'tband',
                          band.open ? 'open live' : '',
                          isLast ? (bands.length === 1 ? 'onlyband' : 'lastband') : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{
                          left: `${x0}%`,
                          width: `${width}%`,
                          zIndex: tiny ? 120 + bi : 3 + bi,
                          animationDelay: `${row * 35 + bi * 38}ms`,
                          // The segment takes the colour of its own card, so the
                          // bar and the strip above it read as one thing.
                          backgroundColor: band.family.hex,
                        }}
                        {...bind(tip)}
                      />
                      {label ? (
                        <div
                          className="tblabel"
                          style={{ left: `${x0}%`, width: `${solid}%`, ...(tiny ? { zIndex: 130 } : {}) }}
                        >
                          {label}
                        </div>
                      ) : null}
                      {over && target ? (
                        <div
                          className={`tover${isLast ? ' lastband' : ''}`}
                          style={{
                            left: `${X(target)}%`,
                            width: `${Math.max(0.3, x1 - X(target))}%`,
                            zIndex: 40 + bi,
                            animationDelay: `${row * 35 + bi * 38 + 140}ms`,
                          }}
                          {...bind(
                            <>
                              <TipHead>
                                {ICO.warn} Past the {name.toLowerCase()} target
                              </TipHead>
                              <TipRow label="Target" value={fd(target)} />
                              <TipRow label="Finished" value={fd(band.to)} />
                              <TipRow label="Over by" value={`${days(target, band.to)} days`} emphasis />
                            </>,
                          )}
                        />
                      ) : null}
                      {band.open ? (
                        <div
                          className="tcap"
                          style={{ left: `${x1}%` }}
                          {...bind(
                            <>
                              <TipHead>Where it is today</TipHead>
                              <TipRow label="Stage" value={`${cur + 1}. ${STAGE_NAMES[cur]}`} />
                              <TipRow label="Status" value={item.st[cur]![1]} />
                              <TipRow label="Here for" value={`${duration} days`} />
                            </>,
                          )}
                        />
                      ) : null}
                    </span>
                  )
                })}

                {bands.length === 0 && item.soDate ? (
                  <div
                    className="tband wait"
                    style={{
                      left: `${X(item.soDate)}%`,
                      width: `${Math.max(1, X(today) - X(item.soDate))}%`,
                    }}
                    {...bind(
                      <>
                        <TipHead>{ICO.gap} {t('bar.nothingYet')}</TipHead>
                        <TipRow label={t('bar.ordered')} value={fd(item.soDate)} />
                        <TipNote>{t('bar.nothingYetWhy')}</TipNote>
                      </>,
                    )}
                  >
                    {t('bar.notStartedFor', { n: days(item.soDate, today) })}
                  </div>
                ) : null}

                {item.soDate ? (
                  <div
                    className="tstart"
                    style={{ left: `${X(item.soDate)}%` }}
                    {...bind(
                      <>
                        <TipHead>Order placed</TipHead>
                        <TipRow label="Sales order" value={item.so} />
                        <TipRow label="Date" value={fd(item.soDate)} />
                        <TipRow label="Age today" value={`${days(item.soDate, today)} days`} />
                      </>,
                    )}
                  />
                ) : null}

                <TransitionDates marks={marks} px={px} />

                <BelowMarkers
                  item={item}
                  X={X}
                  px={px}
                  today={today}
                  materialPlan={materialPlan}
                  mfgPlan={mfgPlan}
                  deliveryPlan={deliveryPlan}
                />
              </div>
            </div>

            <div className="tl-today" style={{ left: `${todayX}%` }} />
          </div>
        </div>
      </div>

      {/* The line under the bar answers the question the bar provokes: against
          what? An order whose drawings are not approved has no contractual date
          yet — the clock has not started — and saying "not set" invites the reader
          to think somebody forgot. */}
      <div className="tl-foot">{contractLine(item, today, t, fd)}</div>
    </div>
  )
}

/**
 * What the bar is measured against, in the customer's terms.
 *
 * A plain function, not a component, so the translator and the date formatter are
 * passed in rather than pulled from hooks — calling a hook here would work today
 * only because the one caller happens to be mid-render.
 */
export function contractLine(
  item: CustomerItem,
  today: string,
  t: Translate,
  fd: (s: string | null | undefined) => string,
): string {
  if (item.cDate) {
    const date = fd(item.cDate)
    const left = days(today, item.cDate)
    if (left === null) return t('foot.contractual', { date })
    if (left > 0) return t('foot.contractualLeft', { date, n: left })
    if (left === 0) return t('foot.contractualToday', { date })
    return t('foot.contractualPast', { date, n: Math.abs(left) })
  }
  if (item.cPeriod) return t('foot.period', { n: item.cPeriod })
  return t('foot.none')
}

/** Dates along the top, left to right, dropping any that would collide. */
function TransitionDates({ marks, px }: { marks: { x: number; text: string }[]; px: (w: number) => number }) {
  const kept: { x: number; text: string }[] = []
  let lastX = -999
  for (const m of [...marks].sort((a, b) => a.x - b.x)) {
    if (px(m.x - lastX) < 52) continue
    lastX = m.x
    kept.push(m)
  }
  return (
    <div className="trk-dates">
      {kept.map((m, i) => (
        <div
          className="tdate"
          key={i}
          style={{
            left: `${m.x}%`,
            transform: px(m.x) < 30 ? 'translateX(-6px)' : px(100 - m.x) < 34 ? 'translateX(-94%)' : undefined,
          }}
        >
          {m.text}
        </div>
      ))}
    </div>
  )
}

/** Targets and the contractual date, below the strip, each with its own label. */
function BelowMarkers({
  item,
  X,
  px,
  today,
  materialPlan,
  mfgPlan,
  deliveryPlan,
}: {
  item: CustomerItem
  X: (s: string | null | undefined) => number
  px: (w: number) => number
  today: string
  materialPlan: string | null
  mfgPlan: string | null
  deliveryPlan: string | null
}) {
  const fd = useFd()
  const t = useT()
  const bind = useTip()
  const below: { x: number; cls: string; text: string; tip: React.ReactNode }[] = []

  /* The ERPNext field each target comes from used to be shown in the tooltip. It
     told a customer nothing they could act on and put internal schema names on a
     screen, so the marker now says what the date means instead of where it is
     stored. */
  const targets: [number, string | null][] = [
    [1, materialPlan],
    [2, mfgPlan],
  ]

  for (const [si, plan] of targets) {
    if (!plan) continue
    const stage = item.st[si]!
    const end = stage[3] ?? (stage[0] === STATE.active && stage[2] ? today : null)
    const missed = Boolean(end && end > plan)
    below.push({
      x: X(plan),
      cls: `tplan${missed ? ' miss' : ''}`,
      text: t(si === 1 ? 'mark.material' : 'mark.manufacturing', { date: fd(plan) }),
      tip: (
        <>
          <TipHead>
            {missed ? ICO.warn : ICO.info} {t('mark.target', { stage: STAGE_SHORT[si] ?? '' })}
          </TipHead>
          <TipRow label={t('mark.planSaid')} value={fd(plan)} />
          {end ? (
            <TipRow
              label={t(stage[3] ? 'mark.actually' : 'mark.running')}
              value={fd(end)}
              emphasis={missed}
            />
          ) : (
            <TipRow label={t('mark.stage')} value={t('mark.notStarted')} />
          )}
          {missed && end ? (
            <TipRow label={t('mark.overBy')} value={t('unit.days', { n: days(plan, end) })} emphasis />
          ) : null}
        </>
      ),
    })
  }

  if (deliveryPlan) {
    below.push({
      x: X(deliveryPlan),
      cls: 'tcon',
      text: t('mark.contractual', { date: fd(deliveryPlan) }),
      tip: (
        <>
          <TipHead swatch={STAGE_HEX[5]}>{t('mark.contractualDelivery')}</TipHead>
          <TipRow label={t('mark.agreedDate')} value={fd(deliveryPlan)} />
          {item.cPeriod ? (
            <TipRow label={t('mark.agreedPeriod')} value={t('mark.periodFromOrder', { n: item.cPeriod })} />
          ) : null}
          {item.dtc !== null ? (
            <TipRow
              label="Status"
              value={item.dtc < 0 ? `${Math.abs(item.dtc)} days overdue` : `${item.dtc} days remaining`}
              emphasis={item.dtc < 0}
            />
          ) : null}
        </>
      ),
    })
  }

  if (item.deliv > 0 && item.cDate) {
    below.push({
      x: X(item.cDate),
      cls: 'tdel',
      text: 'Delivered',
      tip: (
        <>
          <TipHead>{ICO.ok} Delivered</TipHead>
          <TipRow label="Panels" value={`${item.deliv} of ${item.qty}`} />
        </>
      ),
    })
  }

  below.sort((a, b) => a.x - b.x)
  /* Left to right, so the collision pass below actually works. The markers are
     pushed in the order they are computed — material, manufacturing, contractual —
     which is not the order they sit in: a contractual date can fall before a
     material target. Comparing against `lastLabel` down an unsorted list let two
     captions print on top of each other. */
  below.sort((a, b) => a.x - b.x)
  let lastLabel = -999

  return (
    <>
      {below.map((m, i) => {
        const showLabel = px(m.x - lastLabel) >= 96
        if (showLabel) lastLabel = m.x
        return (
          <span key={i}>
            <div className={m.cls} style={{ left: `${m.x}%` }} {...bind(m.tip)} />
            {showLabel ? (
              <div
                className="tblab"
                style={{
                  left: `${m.x}%`,
                  transform: px(m.x) < 44 ? 'translateX(-8px)' : px(100 - m.x) < 52 ? 'translateX(-92%)' : undefined,
                }}
              >
                {m.text}
              </div>
            ) : null}
          </span>
        )
      })}
    </>
  )
}
