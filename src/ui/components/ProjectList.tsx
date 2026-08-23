'use client'

/**
 * The projects, as one panel of rows.
 *
 * This replaces a grid of cards. The sign-in screen is a single elevated panel
 * with internal hairlines, and that construction is what the authenticated app is
 * being brought in line with — but the reasoning is not only stylistic. A row
 * puts the same field in the same column on every project, which is what makes a
 * portfolio comparable; cards force the eye to re-find each figure, and eleven of
 * them put eleven competing borders on a page meant to feel calm.
 *
 * A node in the first column carries status — the sign-in screen's 5px orange dot,
 * and the vernacular of the single-line diagram behind it: a network of nodes,
 * each either energised or not.
 */

import type { CustomerItem, CustomerOrder } from '@/portal/types'
import { STAGES, visibleStageOf } from '@/portal/milestones'
import { statusKeyOf } from '@/portal/journey'
import { arw, egp, useFd } from '../lib/format'
import { useLabel, useT, type MessageKey } from '../lib/i18n'
import { projectStatus } from '../lib/status'
import { indexItems, itemsOf } from '../lib/select'

const Chevron = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
)

/**
 * The next thing to happen on this order.
 *
 * Taken from the least-advanced line, because an order is only as ready as its
 * slowest panel — reporting the furthest-along line would flatter the schedule.
 *
 * Both halves now come from the report: the milestone from `Current Stage #` and
 * the wording from `Current Step`. The portal used to work this out from its own
 * chain of timestamps, which meant two rules for one question. Spec, Delta 3.
 */
export function nextOf(
  items: readonly CustomerItem[],
): { stage: string; stageKey: string; status: string; statusKey: string } | null {
  const pending = items.filter((i) => i.pct < 100)
  if (pending.length === 0) return null
  const slowest = pending.reduce((a, b) => (b.stage < a.stage ? b : a))
  const spec = STAGES[visibleStageOf(slowest.stage)]
  if (!spec) return null
  const status = slowest.step ?? 'Not started'
  // Keys as well as words: this line is the only place on the dashboard that names
  // a stage, and it was reaching the Arabic screen in English.
  return {
    stage: spec.name,
    stageKey: spec.nameKey,
    status,
    statusKey: slowest.step ? statusKeyOf(slowest.step) : 'table.notStarted',
  }
}

export function ProjectList({
  orders,
  items,
  onOpen,
}: {
  orders: readonly CustomerOrder[]
  items: readonly CustomerItem[]
  onOpen: (so: string) => void
}) {
  const fd = useFd()
  const t = useT()
  const lbl = useLabel()
  const byId = indexItems(items)

  return (
    <div className="plist">
      <div className="plist-cols" aria-hidden>
        <span>{t('list.project')}</span>
        <span>{t('list.status')}</span>
        <span>{t('list.progress')}</span>
        <span className="r">{t('list.contract')}</span>
        <span className="r">{t('list.openBacklog')}</span>
        <span />
      </div>

      {orders.map((order) => {
        const status = projectStatus(order)
        const next = nextOf(itemsOf(order, byId))
        const timing =
          order.dtc !== null && order.dtc < 0
            ? t('list.overdue', { n: Math.abs(order.dtc) })
            : order.cDate
              ? t('list.due', { date: fd(order.cDate) })
              : t('list.noDate')

        return (
          <button
            key={order.so}
            className={`plist-row st-${status.key}`}
            onClick={() => onOpen(order.so)}
            aria-label={`${order.proj} — ${t(status.label as MessageKey)}`}
          >
            <span className="pr-id">
              <span className="pr-name">
                <span className={`node ${status.key}`} />
                <span className="t">{arw(order.proj)}</span>
              </span>
              <span className="pr-meta">
                <span className="so">{order.so}</span>
                <span className="sep" />
                <span>{t('list.items', { n: order.nItems })}</span>
                <span className="sep" />
                <span>{t('list.panels', { delivered: order.deliv, total: order.qty })}</span>
                {order.pm ? (
                  <>
                    <span className="sep" />
                    <span>{order.pm}</span>
                  </>
                ) : null}
              </span>
            </span>

            <span className="pr-state">
              <span className="pr-stat">{t(status.label as MessageKey)}</span>
              <span className="pr-next">
                {next
                  ? `${lbl(next.stageKey, next.stage)} · ${lbl(next.statusKey, next.status)}`
                  : timing}
              </span>
            </span>

            <span className="pr-prog">
              <span className="v">{order.pct}%</span>
              <span className="prog">
                <i style={{ width: `${order.pct}%` }} />
              </span>
            </span>

            <span className="pr-nums">
              <span className="pr-num">
                <span className="pr-num-l">{t('list.contract')}</span>
                {egp(order.contract)}
              </span>
              <span className={order.backlog > 0 ? 'pr-num' : 'pr-num zero'}>
                <span className="pr-num-l">{t('list.openBacklog')}</span>
                {egp(order.backlog)}
              </span>
            </span>

            <span className="pr-go">
              <Chevron />
            </span>
          </button>
        )
      })}
    </div>
  )
}
