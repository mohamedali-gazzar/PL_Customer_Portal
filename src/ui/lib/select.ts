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

/**
 * Open-backlog size bands.
 *
 * Fixed thresholds rather than quantiles of whatever is on screen: a band has to
 * mean the same thing every time it is chosen, and "over ten million" is a
 * sentence a project manager can act on where "the top tercile" is not.
 *
 * They also happen to divide the real portfolio usefully — 7 orders carry a third
 * of the value, 74 carry most of the rest, and 76 are under a million.
 */
export const BACKLOG_BANDS = [
  { key: 'high', label: 'EGP 10M and over', min: 10_000_000, max: Infinity },
  { key: 'mid', label: 'EGP 1M – 10M', min: 1_000_000, max: 10_000_000 },
  { key: 'low', label: 'Under EGP 1M', min: 0, max: 1_000_000 },
] as const

export type BacklogBand = (typeof BACKLOG_BANDS)[number]['key'] | 'all'

export function byBacklog(orders: readonly PortalOrder[], band: BacklogBand): PortalOrder[] {
  if (band === 'all') return [...orders]
  const spec = BACKLOG_BANDS.find((b) => b.key === band)
  if (!spec) return [...orders]
  // Half-open at the top, so an order worth exactly 10M lands in one band, not two.
  return orders.filter((o) => o.backlog >= spec.min && o.backlog < spec.max)
}
