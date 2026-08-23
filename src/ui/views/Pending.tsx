'use client'

/**
 * The one screen about the customer's own work.
 *
 * Every other view answers "where is my order". This one answers "what is waiting
 * on me", and it exists because that question has a different urgency: an item at
 * Drawings Approval is not moving, and the only person who can move it is reading
 * this page.
 *
 * So it leads with the count and the consequence — nothing goes to production
 * until the drawings are approved — and then lists each item with the one number
 * that matters, how long it has been sitting there. Days waiting, not a status
 * word: "pending" reads the same at four days and at two hundred.
 */

import { useMemo } from 'react'

import { AWAITING_APPROVAL_STAGE } from '@/portal/milestones'
import type { CustomerItem, ScopedSnapshot } from '@/portal/types'
import { useT } from '../lib/i18n'
import { arw, days, useFd } from '../lib/format'

export function Pending({
  data,
  today,
  onOpenItem,
}: {
  data: ScopedSnapshot
  today: string
  onOpenItem: (so: string, id: number) => void
}) {
  const t = useT()
  const fd = useFd()

  const waiting = useMemo(() => {
    const shown = new Set(data.orders.map((o) => o.so))
    const rows = data.items.filter(
      (i) => shown.has(i.so) && i.stage === AWAITING_APPROVAL_STAGE,
    )
    /* Longest wait first. The list is a queue of things to act on, and the item
       that has been sitting longest is the one to act on first. */
    return [...rows].sort((a, b) => waitingDays(b, today) - waitingDays(a, today))
  }, [data.items, data.orders, today])

  const projectOf = (so: string) => data.orders.find((o) => o.so === so)

  if (waiting.length === 0) {
    return <p className="empty">{t('pend.none')}</p>
  }

  return (
    <>
      <div className="pend-head">
        <div>
          <h2 className="pend-h">{t('pend.headline')}</h2>
          <p className="pend-b">{t('pend.body')}</p>
        </div>
        <div className="pend-n">
          <b>{waiting.length}</b>
          <span>{t('pend.count')}</span>
        </div>
      </div>

      <div className="pend-list">
        {waiting.map((it) => {
          const order = projectOf(it.so)
          const sent = sentOn(it)
          return (
            <div className="pend-row" key={it.id}>
              <div className="pend-main">
                <div className="pend-code">
                  {it.code}
                  {it.grp ? <span className="pend-grp"> · {it.grp}</span> : null}
                </div>
                <div className="pend-meta mono">
                  {[it.so, order ? arw(order.proj) : null, `QTY ${it.qty}`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                <div className="pend-figs">
                  <span>
                    <em>{t('pend.sent')}</em>
                    <b>{sent ? fd(sent) : '—'}</b>
                  </span>
                  <span>
                    <em>{t('pend.waiting')}</em>
                    <b className="hot">{t('unit.days', { n: waitingDays(it, today) })}</b>
                  </span>
                  <span>
                    <em>{t('pend.orderAge')}</em>
                    <b>{t('unit.days', { n: days(it.soDate, today) })}</b>
                  </span>
                </div>
              </div>
              <button className="pend-go" onClick={() => onOpenItem(it.so, it.id)}>
                {t('pend.open')}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

/**
 * When the drawings went out.
 *
 * The report's own counter is preferred where it has one — it measures against the
 * same clock as everything else in the export — and the stage's start date is the
 * fallback. Slot 3 is where v8's step 2 begins: the RFD submitted, drawings with
 * the customer.
 */
const RFD_SUBMITTED = 3

function sentOn(item: CustomerItem): string | null {
  return item.since ?? item.sd[RFD_SUBMITTED] ?? null
}

function waitingDays(item: CustomerItem, today: string): number {
  if (item.dis !== null) return item.dis
  const from = sentOn(item)
  return from ? days(from, today) : 0
}
