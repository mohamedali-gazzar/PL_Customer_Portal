import { workOrderProgress } from '@/portal/derive'
import type { PortalItem, PortalOrder } from '@/portal/types'

/**
 * Work-order status, from the ERP's `Main WO Status`.
 *
 * The raw column is not a clean set of values. Alongside `Completed`,
 * `In Process` and `Not Started` it carries `Closed`, and — where a line has
 * several work orders — statuses joined as text: `Completed, Not Started`,
 * `In Process, Not Started`. Offering those verbatim would put three options in
 * the list matching a single row each, and leave a customer wondering what
 * `Completed, Not Started` is supposed to mean about their panel.
 *
 * So the same resolution the rest of the portal uses is applied here:
 * `workOrderProgress` takes the most advanced status in the string, and `Closed`
 * counts as a completion. That collapses the seven raw values into four buckets
 * which partition the 488 lines exactly — 163 complete, 39 in process, 127 not
 * started, 159 with no work order raised at all.
 *
 * "No work order" is a state, not a gap: 159 lines have not been released to the
 * shop floor yet, and that is the most useful thing to be able to look for.
 */
export const WO_STATUSES = [
  { key: 'completed', label: 'wo.completed' },
  { key: 'inprocess', label: 'wo.inprocess' },
  { key: 'notstarted', label: 'wo.notstarted' },
  { key: 'nowo', label: 'wo.nowo' },
] as const

export type WoStatusKey = (typeof WO_STATUSES)[number]['key']
export type WoFilter = WoStatusKey | 'all'

export function woStatusOf(item: PortalItem): WoStatusKey {
  if (!item.wo) return 'nowo'
  switch (workOrderProgress(item.woStatus ?? null)) {
    case 'done':
      return 'completed'
    case 'active':
      return 'inprocess'
    case 'notstarted':
      return 'notstarted'
    default:
      return 'nowo'
  }
}

/**
 * Projects containing at least one panel at this work-order status.
 *
 * A status is a property of a panel, not of an order, and 38 of the 157 orders
 * span more than one. "At least one" is the only reading that does not silently
 * hide an order that is partly in the state being asked about.
 */
export function byWoStatus(
  orders: readonly PortalOrder[],
  itemsById: Map<number, PortalItem>,
  status: WoFilter,
): PortalOrder[] {
  if (status === 'all') return [...orders]
  return orders.filter((o) =>
    o.items.some((id) => {
      const item = itemsById.get(id)
      return item !== undefined && woStatusOf(item) === status
    }),
  )
}

/** How many projects contain at least one panel at each status. */
export function woStatusCounts(
  orders: readonly PortalOrder[],
  itemsById: Map<number, PortalItem>,
): Record<WoStatusKey, number> {
  const counts = { completed: 0, inprocess: 0, notstarted: 0, nowo: 0 }
  for (const o of orders) {
    const present = new Set<WoStatusKey>()
    for (const id of o.items) {
      const item = itemsById.get(id)
      if (item) present.add(woStatusOf(item))
    }
    for (const k of present) counts[k] += 1
  }
  return counts
}
