import type { PortalItem, PortalOrder } from '@/portal/types'

/** Index the item lines once per render, rather than scanning per order. */
export const indexItems = (items: readonly PortalItem[]): Map<number, PortalItem> =>
  new Map(items.map((i) => [i.id, i]))

/** The lines belonging to one order, in the order the ERP lists them. */
export const itemsOf = (order: PortalOrder, byId: Map<number, PortalItem>): PortalItem[] =>
  order.items.map((id) => byId.get(id)).filter((i): i is PortalItem => i !== undefined)

export const sum = <T,>(xs: readonly T[], f: (x: T) => number): number =>
  xs.reduce((a, x) => a + f(x), 0)
