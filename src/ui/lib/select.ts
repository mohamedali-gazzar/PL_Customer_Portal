import type { PortalItem, PortalOrder } from '@/portal/types'

/** Index the item lines once per render, rather than scanning per order. */
export const indexItems = (items: readonly PortalItem[]): Map<number, PortalItem> =>
  new Map(items.map((i) => [i.id, i]))

/** The lines belonging to one order, in the order the ERP lists them. */
export const itemsOf = (order: PortalOrder, byId: Map<number, PortalItem>): PortalItem[] =>
  order.items.map((id) => byId.get(id)).filter((i): i is PortalItem => i !== undefined)

export const sum = <T,>(xs: readonly T[], f: (x: T) => number): number =>
  xs.reduce((a, x) => a + f(x), 0)

/**
 * The order years present in the data, most recent first.
 *
 * Taken from the sales-order date, because that is the year a customer thinks of
 * an order as belonging to — not the contractual date, which often falls in the
 * following year and would file the order under a year it was never placed in.
 */
export function orderYears(orders: readonly PortalOrder[]): string[] {
  const years = new Set<string>()
  for (const o of orders) if (o.soDate) years.add(o.soDate.slice(0, 4))
  return [...years].sort((a, b) => b.localeCompare(a))
}

/** `'all'` spans everything, including orders with no date recorded. */
export function byYear(orders: readonly PortalOrder[], year: string): PortalOrder[] {
  if (year === 'all') return [...orders]
  return orders.filter((o) => o.soDate?.startsWith(year))
}
