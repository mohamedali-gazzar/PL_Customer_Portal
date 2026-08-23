'use client'

/**
 * Open Orders and History — the same question asked twice.
 *
 * One view, two scopes. An order is either still owed to the customer or already
 * shipped, and those are the two lists anyone actually wants: what is coming, and
 * what came. Splitting them into two components would duplicate a table to change
 * one predicate and a column heading.
 *
 * The split is on delivered quantity, not on a status word: an order counts as
 * history when every line on it has shipped. A partially delivered order is still
 * open, because part of it is still owed — which is the reading the customer cares
 * about and the opposite of what a "delivered" flag would say.
 */

import { useMemo } from 'react'

import type { ScopedSnapshot } from '@/portal/types'
import { useT } from '../lib/i18n'
import { ProjectList } from '../components/ProjectList'

export type OrderScope = 'open' | 'delivered'

/** Every line shipped. The order is finished and belongs in history. */
const isDelivered = (deliv: number, qty: number) => qty > 0 && deliv >= qty

export function Orders({
  data,
  scope,
  onOpenProject,
}: {
  data: ScopedSnapshot
  scope: OrderScope
  onOpenProject: (so: string) => void
}) {
  const t = useT()
  // ProjectList takes the flat list and indexes internally.

  const orders = useMemo(() => {
    const rows = data.orders.filter((o) =>
      scope === 'delivered' ? isDelivered(o.deliv, o.qty) : !isDelivered(o.deliv, o.qty),
    )
    /* History reads newest first — the last thing that shipped is the thing most
       likely being looked for. The open list keeps its own ordering, which puts
       the work that needs attention at the top. */
    return scope === 'delivered'
      ? [...rows].sort((a, b) => (b.cDate ?? '').localeCompare(a.cDate ?? ''))
      : rows
  }, [data.orders, scope])

  if (orders.length === 0) {
    return <p className="empty">{t(scope === 'delivered' ? 'hist.none' : 'open.none')}</p>
  }

  return <ProjectList orders={orders} items={data.items} onOpen={onOpenProject} />
}
