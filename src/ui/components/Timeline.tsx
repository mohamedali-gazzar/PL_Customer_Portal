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

import type { PortalItem, PortalOrder } from '@/portal/types'
import { STATE } from '@/portal/types'
import { PHASES, PHASE_HEX, STAGE_HEX, STAGE_NAMES, STAGE_SHORT } from '@/portal/constants'
import { journeyOf, JOURNEY_HEX } from '@/portal/journey'
import { D, days, fd, ICO, Pill } from '../lib/format'
import { TipHead, TipNote, TipRow, useTip } from '../lib/tooltip'

const DAY = 86_400_000

/* ------------------------------------------------------------------ bands -- */

export interface Band {
  kind: 'phase' | 'wait'
  from: string
  to: string
  /** Phase indices this band covers. Equal unless timestamps are missing. */
  p0: number | null
  p1: number | null
  /** The open-ended band running up to today. */
  tail?: boolean
  /** Started, but with no completion timestamp yet. */
  open?: boolean
  label?: string
  why?: string
}

/**
 * Turn the nine-timestamp chain into contiguous bands.
 *
 * Two realities of production data are handled here rather than hidden:
 *
 *  - Timestamps can arrive out of order — a later phase stamped earlier than an
 *    earlier one. The chain is forced monotonic first, so a bar can never be drawn
 *    running backwards.
 *  - A timestamp in the middle can be missing. The phases either side are then
 *    merged into one span and labelled as such ("T3–T4"), rather than guessing a
 *    boundary that would put a number on something nobody recorded.
 */
export function buildBands(item: PortalItem, today: string, currentStage: number): Band[] {
  const ch = [...item.ch]
  for (let i = 0, max: string | null = null; i < ch.length; i += 1) {
    const v = ch[i]
    if (!v) continue
    if (max && v < max) ch[i] = max
    max = ch[i] ?? null
  }

  const bands: Band[] = []
  let start = 0
  while (start < ch.length && !ch[start]) start += 1
  let last = start

  for (let i = start + 1; i < ch.length; i += 1) {
    if (!ch[i]) continue
    if (ch[i]! > ch[last]!) {
      bands.push({ kind: 'phase', from: ch[last]!, to: ch[i]!, p0: last, p1: i - 1 })
      last = i
    } else if (i > last) {
      last = i // a zero-length phase: move on, never step back
    }
  }

  // The open end. We are inside the phase that began at the last known timestamp,
  // so name that phase rather than calling the time since then a blank.
  const tailFrom = ch[last] ?? item.soDate
  if (tailFrom && tailFrom < today) {
    const running = last < PHASES.length ? last : null
    bands.push({
      kind: running !== null ? 'phase' : 'wait',
      from: tailFrom,
      to: today,
      tail: true,
      open: true,
      p0: running,
      p1: running,
      label: running !== null ? PHASES[running]!.n : `Waiting · ${STAGE_SHORT[currentStage]}`,
      why:
        running !== null
          ? `${PHASES[running]!.w} This phase is still open — ERPNext has no completion date for it yet.`
          : `Nothing further has been recorded on this panel since ${fd(tailFrom)}.`,
    })
  }

  return bands
}

/** The stage a panel is sitting in — the first that is neither finished nor unavailable. */
export function currentStageOf(item: PortalItem): number {
  const i = item.st.findIndex((x) => x[0] === STATE.none || x[0] === STATE.active)
  return i < 0 ? 6 : i
}

/* --------------------------------------------------------------- component -- */

export function Timeline({
  order,
  items,
  today,
}: {
  order: PortalOrder
  items: readonly PortalItem[]
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

  /* -- month scale --------------------------------------------------------- */
  const months: Date[] = []
  {
    const first = new Date(window_.lo)
    let m = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)
    while (m < window_.hi) {
      if (m >= window_.lo) months.push(new Date(m))
      const d = new Date(m)
      m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    }
  }
  const step = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor(laneWidth / 62))))
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div className="card">
      <div className="tl-wrap">
        <div className="tl-scale">
          {months.map((d, i) => {
            if (i % step) return null
            const p = geom.X(d.toISOString().slice(0, 10))
            if (p < 0 || p > 100) return null
            if (Math.abs(p - todayX) < 3.4) return null // never collide with TODAY
            const label = MON[d.getUTCMonth()] + (d.getUTCMonth() === 0 || i === 0 ? ` '${String(d.getUTCFullYear()).slice(2)}` : '')
            const transform = px(p) < 26 ? 'translateX(-4px)' : px(100 - p) < 26 ? 'translateX(-96%)' : undefined
            return (
              <span key={d.toISOString()}>
                <div className="tkline" style={{ left: `${p}%` }} />
                <div className="tk" style={{ left: `${p}%`, transform }}>
                  {label}
                </div>
              </span>
            )
          })}
          <div className="today-tk" style={{ left: `${todayX}%` }}>
            TODAY
          </div>
          <div className="tkline" style={{ left: `${todayX}%` }} />
        </div>

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
  item: PortalItem
  row: number
  today: string
  todayX: number
  X: (s: string | null | undefined) => number
  px: (w: number) => number
  plotRef?: React.RefObject<HTMLDivElement | null>
}) {
  const bind = useTip()
  const cur = currentStageOf(item)
  const bands = useMemo(() => buildBands(item, today, cur), [item, today, cur])

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
            {item.name ?? ''} · Qty {item.qty} · {item.grp ?? ''}
            {item.wo ? ` · ${item.wo}` : ''}
          </div>
        </div>
        <div className="rt">
          {item.hold ? <Pill kind="warn">On hold</Pill> : null}
          {item.late ? (
            <Pill kind="bad">{`${Math.abs(item.dtc ?? 0)} days past contractual date`}</Pill>
          ) : item.dtc !== null ? (
            <Pill kind="ok">{`${item.dtc} days to contractual date`}</Pill>
          ) : (
            <Pill kind="info">No contractual date</Pill>
          )}
          <span className="ti-pct">
            <span className="tr">
              <i style={{ width: `${item.pct}%` }} />
            </span>
            <b>{item.pct}%</b>
          </span>
        </div>
      </div>

      {/* the journey, in the order a customer experiences it */}
      <div className="journey">
        {journeyOf(item, today).map((lvl) => (
          <div
            key={lvl.n}
            className={`jst ${lvl.state === 'done' ? 'done' : lvl.state === 'active' ? 'act' : 'pend'}`}
            style={{ ['--jc' as string]: JOURNEY_HEX[lvl.n] }}
            {...bind(
              <>
                <TipHead swatch={JOURNEY_HEX[lvl.n]}>{`${lvl.n + 1}. ${lvl.label}`}</TipHead>
                <TipRow label="Status" value={lvl.status} />
                {lvl.from ? <TipRow label="Started" value={fd(lvl.from)} /> : null}
                {lvl.to ? <TipRow label="Finished" value={fd(lvl.to)} /> : null}
                {lvl.days !== null ? (
                  <TipRow label={lvl.state === 'active' ? 'Running' : 'Took'} value={`${lvl.days} days`} />
                ) : null}
                {lvl.planned ? <TipRow label="Planned by" value={fd(lvl.planned)} /> : null}
                <TipNote>{lvl.what}</TipNote>
              </>,
            )}
          >
            <div className="jh">
              <span className="jnum">{lvl.n + 1}</span>
              <span className="jname">{lvl.label}</span>
            </div>
            <div className="jstat">{lvl.status}</div>
            {lvl.from ? (
              <div className="jdt">
                <span>{lvl.state === 'done' && lvl.to ? 'Done' : 'From'}</span>
                <b>{fd(lvl.state === 'done' && lvl.to ? lvl.to : lvl.from)}</b>
              </div>
            ) : null}
            {lvl.days !== null ? (
              <div className="jdt">
                <span>{lvl.state === 'active' ? 'Running' : 'Took'}</span>
                <b>{lvl.days}d</b>
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
                  const merged = band.kind === 'phase' && band.p1! > band.p0!
                  const target = band.kind === 'phase' ? (phaseTarget[band.p1!] ?? null) : null
                  const over = Boolean(target && band.to > target && band.from < target)
                  const name =
                    band.kind === 'phase'
                      ? merged
                        ? `${PHASES[band.p0!]!.n} → ${PHASES[band.p1!]!.n}`
                        : PHASES[band.p0!]!.n
                      : band.label!
                  const code =
                    band.kind === 'phase'
                      ? merged
                        ? `${PHASES[band.p0!]!.t}–${PHASES[band.p1!]!.t}`
                        : PHASES[band.p0!]!.t
                      : ''
                  const solid = over && target ? Math.max(0.35, X(target) - x0) : width
                  const room = px(solid)
                  const fullLabel = `${name} · ${duration}${band.open ? 'd so far' : 'd'}`
                  // A clipped word is worse than no word.
                  const label = room >= fullLabel.length * 6.4 + 14 ? fullLabel : room >= 46 ? `${duration}d` : ''
                  const isLast = bi === bands.length - 1

                  marks.push({ x: x0, text: fd(band.from) })
                  if (isLast) marks.push({ x: x1, text: band.tail ? 'today' : fd(band.to) })

                  const tip = (
                    <>
                      {band.kind === 'phase' ? (
                        <TipHead swatch={PHASE_HEX[band.p0!]}>{`${code} · ${name}`}</TipHead>
                      ) : (
                        <TipHead>
                          {ICO.info} {band.label}
                        </TipHead>
                      )}
                      <TipRow label="From" value={fd(band.from)} />
                      <TipRow label={band.tail ? 'Still going, now' : 'To'} value={band.tail ? 'today' : fd(band.to)} />
                      <TipRow label={band.open ? 'Open for' : 'Duration'} value={`${duration} days`} />
                      {band.kind === 'phase' && band.p0! <= 1 && band.p1! >= 1 && item.nRev ? (
                        <TipRow label="Revisions" value={`${item.nRev} round${item.nRev > 1 ? 's' : ''}`} />
                      ) : null}
                      {band.open ? <TipRow label="Panel status" value={item.st[cur]![1]} /> : null}
                      {target ? <TipRow label="Target was" value={fd(target)} /> : null}
                      {over && target ? (
                        <TipRow label="Over target by" value={`${days(target, band.to)} days`} emphasis />
                      ) : null}
                      <TipNote>
                        {band.kind === 'phase'
                          ? merged
                            ? `Covers ${code}. One of the timestamps between them is missing in ERPNext, so they are shown as one span rather than guessed.`
                            : PHASES[band.p0!]!.w
                          : band.why}
                      </TipNote>
                    </>
                  )

                  return (
                    <span key={bi}>
                      <div
                        className={[
                          'tband',
                          band.kind === 'wait' ? 'wait' : '',
                          band.open ? 'open' : '',
                          band.tail ? 'live' : '',
                          isLast ? (bands.length === 1 ? 'onlyband' : 'lastband') : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{
                          left: `${x0}%`,
                          width: `${width}%`,
                          zIndex: tiny ? 120 + bi : 3 + bi,
                          animationDelay: `${row * 35 + bi * 38}ms`,
                          ...(band.kind === 'phase' ? { backgroundColor: PHASE_HEX[band.p0!] } : {}),
                        }}
                        {...bind(tip)}
                      />
                      {label ? (
                        <div
                          className={`tblabel${band.kind === 'wait' ? ' wait' : ''}`}
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
                      {band.tail ? (
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
                        <TipHead>{ICO.gap} Nothing recorded yet</TipHead>
                        <TipRow label="Ordered" value={fd(item.soDate)} />
                        <TipNote>No stage on this panel has started in the ERP yet.</TipNote>
                      </>,
                    )}
                  >
                    {`Not started · ${days(item.soDate, today)}d`}
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
    </div>
  )
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
  item: PortalItem
  X: (s: string | null | undefined) => number
  px: (w: number) => number
  today: string
  materialPlan: string | null
  mfgPlan: string | null
  deliveryPlan: string | null
}) {
  const bind = useTip()
  const below: { x: number; cls: string; text: string; tip: React.ReactNode }[] = []

  const targets: [number, string | null, string][] = [
    [1, materialPlan, 'material_delivery_date'],
    [2, mfgPlan, 'planned_end_date'],
  ]

  for (const [si, plan, field] of targets) {
    if (!plan) continue
    const stage = item.st[si]!
    const end = stage[3] ?? (stage[0] === STATE.active && stage[2] ? today : null)
    const missed = Boolean(end && end > plan)
    below.push({
      x: X(plan),
      cls: `tplan${missed ? ' miss' : ''}`,
      text: `${STAGE_SHORT[si]} target ${fd(plan)}`,
      tip: (
        <>
          <TipHead>
            {missed ? ICO.warn : ICO.info} {STAGE_SHORT[si]} target
          </TipHead>
          <TipRow label="Plan said" value={fd(plan)} />
          {end ? (
            <TipRow label={stage[3] ? 'Actually' : 'Still running, now'} value={fd(end)} emphasis={missed} />
          ) : (
            <TipRow label="Stage" value="not started" />
          )}
          {missed && end ? <TipRow label="Over by" value={`${days(plan, end)} days`} emphasis /> : null}
          <TipRow label="ERP field" value={field} />
        </>
      ),
    })
  }

  if (deliveryPlan) {
    below.push({
      x: X(deliveryPlan),
      cls: 'tcon',
      text: `Contractual ${fd(deliveryPlan)}`,
      tip: (
        <>
          <TipHead swatch={STAGE_HEX[5]}>Contractual delivery</TipHead>
          <TipRow label="Agreed date" value={fd(deliveryPlan)} />
          {item.cPeriod ? <TipRow label="Agreed period" value={`${item.cPeriod} days from order`} /> : null}
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
