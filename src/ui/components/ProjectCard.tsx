'use client'

/**
 * One project, summarised.
 *
 * The card answers, in reading order, the four questions a customer opens the
 * portal to ask: is it on time, how far along is it, what happens next, and what
 * is it worth.
 */

import type { PortalItem, PortalOrder } from '@/portal/types'
import { STATE } from '@/portal/types'
import { STAGE_NAMES } from '@/portal/constants'
import { arw, egp, fd, Pill, s } from '../lib/format'
import { projectStatus } from '../lib/status'

/**
 * The next thing to happen on this order.
 *
 * Taken from the least-advanced line, because an order is only as ready as its
 * slowest panel — reporting the furthest-along line would flatter the schedule.
 */
export function nextOf(items: readonly PortalItem[]): string | null {
  const pending = items.filter((i) => i.pct < 100)
  if (pending.length === 0) return null
  const slowest = pending.reduce((a, b) => (b.pct < a.pct ? b : a))
  const stage = slowest.st.findIndex((x) => x[0] === STATE.none || x[0] === STATE.active)
  if (stage < 0) return null
  return `${stage + 1}. ${STAGE_NAMES[stage]} — ${slowest.st[stage]![1]}`
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

  // The same function the status filter uses, so the badge and the filter can
  // never disagree about what this project's status is.
  const status = projectStatus(order)

  return (
    <div
      className="card pcard"
      style={{ animationDelay: `${index * 55}ms` }}
      onClick={() => onOpen(order.so)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(order.so)
        }
      }}
    >
      <div className="hd">
        <div>
          <div className="ttl">{arw(order.proj)}</div>
          <div className="meta">
            {order.so} · {order.nItems} item line{s(order.nItems)} · {order.qty} panels · PM:{' '}
            {order.pm ?? '—'}
          </div>
        </div>
        <Pill kind={status.kind}>{status.label}</Pill>
      </div>

      <div className="prog">
        <i style={{ width: `${order.pct}%` }} />
      </div>
      <div className="prog-l">
        <span>{order.pct}% through the milestone model</span>
        <span>
          {order.cDate ? `Contractual delivery: ${fd(order.cDate)}` : 'No contractual date set'}
        </span>
      </div>

      {next ? (
        <div className="nextbar">
          <span className="tg">Next</span>
          <span>
            <b>{next}</b>
          </span>
        </div>
      ) : null}

      <div className="foot">
        <div>
          <span>Contract</span>
          <b className="num">{egp(order.contract)}</b>
        </div>
        <div>
          <span>Delivered</span>
          <b className="num">{egp(order.dvalue)}</b>
        </div>
        <div>
          <span>Backlog</span>
          <b className="num">{egp(order.backlog)}</b>
        </div>
        <div>
          <span>Panels</span>
          <b className="num">
            {order.deliv} / {order.qty}
          </b>
        </div>
      </div>
    </div>
  )
}
