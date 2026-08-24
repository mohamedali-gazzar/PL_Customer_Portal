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
import { arw, egp } from '../lib/format'
import { useLabel, useT } from '../lib/i18n'
import { projectStatus } from '../lib/status'
import { indexItems, itemsOf } from '../lib/select'
import { stageOf } from '../lib/order-stage'

const Chevron = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
)


export function ProjectList({
  orders,
  items,
  onOpen,
}: {
  orders: readonly CustomerOrder[]
  items: readonly CustomerItem[]
  onOpen: (so: string) => void
}) {
  const t = useT()
  const lbl = useLabel()
  const byId = indexItems(items)

  return (
    <div className="plist">
      <div className="plist-cols" aria-hidden>
        <span>{t('list.project')}</span>
        <span>{t('list.stage')}</span>
        <span>{t('list.progress')}</span>
        <span className="r">{t('list.contract')}</span>
        <span className="r">{t('list.openBacklog')}</span>
        <span />
      </div>

      {orders.map((order) => {
        const status = projectStatus(order)
        const at = stageOf(itemsOf(order, byId))

        return (
          <button
            key={order.so}
            className={`plist-row st-${status.key}`}
            onClick={() => onOpen(order.so)}
            aria-label={order.proj}
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

            {/* Where the order is, and nothing about whether that is good news.
                The verdict line above this one read "Past contractual date" on
                every order in the list, so it separated nothing, and a schedule
                judgement is not the portal's to hand the customer. The stage and
                step the report names is the half that was doing work. */}
            <span className="pr-state">
              <span className="pr-next">
                {at === null
                  ? null
                  : at.status !== null && at.statusKey !== null
                    ? `${lbl(at.stageKey, at.stage)} · ${lbl(at.statusKey, at.status)}`
                    : lbl(at.stageKey, at.stage)}
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
