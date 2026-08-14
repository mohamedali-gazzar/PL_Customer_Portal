/**
 * Tenant scoping — the single place a customer's view of the world is cut.
 *
 * Brief §7.1 is a hard requirement: every response is filtered server-side by the
 * customer resolved from the session. This module is the only code that performs
 * that cut, so there is exactly one function to audit and exactly one to test.
 *
 * Two things are deliberately narrowed here rather than in the UI:
 *
 *   - Portfolio metadata is replaced by `CustomerMeta`. Company backlog, project
 *     manager workloads and product mix never enter a customer payload, so no
 *     screen can leak them however it is later changed.
 *   - Item ids are renumbered from zero. The source id is a row offset in a
 *     company-wide export; handing over id 452 discloses that at least 452 other
 *     lines exist.
 */

import type {
  PortalCustomer,
  PortalItem,
  PortalOrder,
  PortalSnapshot,
  ScopedSnapshot,
} from './types'

/**
 * Everything the unauthenticated sign-in screen is given.
 *
 * `stats` and `customers` are populated only in demo mode — see the note on
 * `PortalConfig.demoMode`. In production both are null and the screen renders the
 * same layout with the figures withheld.
 */
export interface GatewayPayload {
  readonly exportDate: string
  readonly demoMode: boolean
  readonly stats: {
    readonly orders: number
    readonly panels: number
    readonly customers: number
    readonly backlog: number
  } | null
  readonly customers: readonly { readonly name: string; readonly backlog: number; readonly nOrders: number }[] | null
}

export function gatewayView(snapshot: PortalSnapshot, demoMode: boolean): GatewayPayload {
  if (!demoMode) {
    return { exportDate: snapshot.meta.exportDate, demoMode: false, stats: null, customers: null }
  }
  return {
    exportDate: snapshot.meta.exportDate,
    demoMode: true,
    stats: {
      orders: snapshot.meta.orders,
      panels: snapshot.meta.rows,
      customers: snapshot.meta.customers,
      backlog: snapshot.meta.backlog,
    },
    customers: snapshot.customers.map((c) => ({
      name: c.name,
      backlog: c.backlog,
      nOrders: c.nOrders,
    })),
  }
}

/**
 * Cut a snapshot down to one customer.
 *
 * Returns `null` when the name matches no customer — the caller turns that into a
 * 401, never into an empty portal, because an empty portal would let someone
 * enumerate which company names exist by looking for the ones that render.
 */
export function scopeToCustomer(snapshot: PortalSnapshot, customerName: string): ScopedSnapshot | null {
  const customer = snapshot.customers.find((c) => c.name === customerName)
  if (!customer) return null

  const orders = snapshot.orders.filter((o) => o.cust === customerName)

  // Renumber. Walk the orders rather than the global item list so the payload
  // cannot contain a line that no visible order refers to.
  const byId = new Map<number, PortalItem>(snapshot.items.map((i) => [i.id, i]))
  const items: PortalItem[] = []
  const remap = new Map<number, number>()

  for (const order of orders) {
    for (const sourceId of order.items) {
      const item = byId.get(sourceId)
      if (!item) continue
      // Defence in depth: an item whose own customer differs from the order's
      // would be a data fault, and must not be served on the strength of the join.
      if (item.cust !== customerName) continue
      remap.set(sourceId, items.length)
      items.push({ ...item, id: items.length })
    }
  }

  const scopedOrders: PortalOrder[] = orders.map((o) => ({
    ...o,
    items: o.items.map((id) => remap.get(id)).filter((id): id is number => id !== undefined),
  }))

  return {
    meta: { exportDate: snapshot.meta.exportDate },
    items,
    orders: scopedOrders,
    customer,
  }
}

/**
 * The staff view: everything, unscoped.
 *
 * Separate from `scopeToCustomer` by design. Widening a customer's scope is then
 * impossible by accident — it takes calling a differently-named function that a
 * route only reaches after asserting the staff role.
 */
export function consoleView(snapshot: PortalSnapshot): PortalSnapshot {
  return snapshot
}

/** Customer names, for the demo sign-in picker. Never exposed outside demo mode. */
export function customerNames(snapshot: PortalSnapshot): readonly PortalCustomer[] {
  return snapshot.customers
}
