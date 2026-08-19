'use client'

/**
 * One project, summarised.
 *
 * Five bands separated by hairlines, in the order the questions get asked: is
 * anything wrong, which project is this, how far along, what happens next, and
 * what is it worth. The previous card put all five at the same weight in one
 * undivided block; dividing it lets the eye land on one band at a time, which is
 * what makes a wall of twelve cards scannable rather than exhausting.
 *
 * The status is carried twice, deliberately: as a 3px stripe down the left edge,
 * which is the only part of a card still legible while scrolling fast, and as a
 * dot and label in the first band once you have stopped.
 */

import type { PortalItem, PortalOrder } from '@/portal/types'
import { STATE } from '@/portal/types'
import { STAGE_NAMES } from '@/portal/constants'
import { arw, egp, fd, s } from '../lib/format'
import { projectStatus } from '../lib/status'

/**
 * The next thing to happen on this order.
 *
 * Taken from the least-advanced line, because an order is only as ready as its
 * slowest panel — reporting the furthest-along line would flatter the schedule.
 */
export function nextOf(items: readonly PortalItem[]): { stage: string; status: string } | null {
  const pending = items.filter((i) => i.pct < 100)
  if (pending.length === 0) return null
  const slowest = pending.reduce((a, b) => (b.pct < a.pct ? b : a))
  const stage = slowest.st.findIndex((x) => x[0] === STATE.none || x[0] === STATE.active)
  if (stage < 0) return null
  return { stage: STAGE_NAMES[stage]!, status: slowest.st[stage]![1] }
}

export function ProjectCard({
  order,
  items,
  index,
  onOpen,
}: {
  order: PortalOrder
  items: readonly PortalItem[]
  index: number
  onOpen: (so: string) => void
}) {
  const next = nextOf(items)
  // The same function the filter uses, so the stripe, the label and the filter
  // can never disagree about what this project's status is.
  const status = projectStatus(order)

  /** How the date reads depends on the status: overdue by, or due on. */
  const timing =
    order.dtc !== null && order.dtc < 0
      ? `${Math.abs(order.dtc)} days overdue`
      : order.cDate
        ? `Due ${fd(order.cDate)}`
        : 'No contractual date'

  return (
    <div
      className={`card pcard st-${status.key}`}
      style={{ animationDelay: `${index * 45}ms` }}
      onClick={() => onOpen(order.so)}
      role="button"
      tabIndex={0}
      aria-label={`${order.proj} — ${status.label}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(order.so)
        }
      }}
    >
      <div className="pc-status">
        <span className="pc-stat">
          <span className="dot" />
          {status.label}
        </span>
        <span className="pc-when">{timing}</span>
      </div>

      <div className="pc-id">
        <div className="ttl">{arw(order.proj)}</div>
        <div className="meta">
          <span className="so">{order.so}</span>
          <span className="sep" />
          <span>
            {order.nItems} line{s(order.nItems)}
          </span>
          <span className="sep" />
          <span>
            {order.deliv} / {order.qty} panels
          </span>
          {order.pm ? (
            <>
              <span className="sep" />
              <span>{order.pm}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="pc-band">
        <div className="pc-prog">
          <span className="l">Progress</span>
          <span className="v">{order.pct}%</span>
        </div>
        <div className="prog">
          <i style={{ width: `${order.pct}%` }} />
        </div>
      </div>

      {next ? (
        <div className="pc-band">
          <div className="pc-next">
            <span className="rule" />
            <span className="txt">
              <span className="l">{status.key === 'action' ? 'Waiting on you' : 'Next'}</span>
              <span className="v">
                {next.stage} <em>· {next.status}</em>
              </span>
            </span>
          </div>
        </div>
      ) : null}

      <div className="pc-money">
        <div>
          <span>Contract</span>
          <b>{egp(order.contract)}</b>
        </div>
        <div className={order.dvalue > 0 ? undefined : 'zero'}>
          <span>Delivered</span>
          <b>{egp(order.dvalue)}</b>
        </div>
        <div>
          <span>Open backlog</span>
          <b>{egp(order.backlog)}</b>
        </div>
      </div>
    </div>
  )
}
