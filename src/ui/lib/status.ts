import type { CustomerOrder } from '@/portal/types'
import type { PillKind } from './format'

/**
 * A project's state — one value, in priority order.
 *
 * These conditions overlap in the real portfolio: 7 orders are both past their
 * contractual date and waiting on the customer, and 7 more are both on hold and
 * late. So a state has to be a single answer arrived at by priority, not a set of
 * flags, or two places on the same card would say different things.
 *
 * It carries no label any more. The customer-facing wording it used to resolve to
 * — "Past contractual date", "On track" — has been taken off the projects list:
 * it appeared on every row, so it distinguished nothing, and telling a customer
 * their own order is late is a judgement the portal should not be making on
 * Powerline's behalf. What remains is a key, which colours the node on the row and
 * nothing else.
 *
 * The order of precedence answers "what is holding this up?":
 *
 *   on hold        nothing is moving, and that outranks how late it is
 *   past date      the schedule has slipped
 *   pending appr.  a drawing is sitting with the customer
 *   on track       nothing to report
 */
export const PROJECT_STATUSES = [
  { key: 'hold', kind: 'warn' },
  { key: 'late', kind: 'bad' },
  { key: 'action', kind: 'warn' },
  { key: 'ontrack', kind: 'ok' },
] as const

export type ProjectStatusKey = (typeof PROJECT_STATUSES)[number]['key']
export type StatusFilter = ProjectStatusKey | 'all'

export interface ProjectStatus {
  readonly key: ProjectStatusKey
  readonly kind: PillKind
}

export function projectStatus(order: CustomerOrder): ProjectStatus {
  const key: ProjectStatusKey = order.hold
    ? 'hold'
    : order.late
      ? 'late'
      : order.await
        ? 'action'
        : 'ontrack'
  return PROJECT_STATUSES.find((s) => s.key === key)! as ProjectStatus
}

export function byStatus(orders: readonly CustomerOrder[], status: StatusFilter): CustomerOrder[] {
  if (status === 'all') return [...orders]
  return orders.filter((o) => projectStatus(o).key === status)
}

/** How many projects sit in each status, for the filter's own labels. */
export function statusCounts(orders: readonly CustomerOrder[]): Record<ProjectStatusKey, number> {
  const counts = { hold: 0, late: 0, action: 0, ontrack: 0 }
  for (const o of orders) counts[projectStatus(o).key] += 1
  return counts
}
