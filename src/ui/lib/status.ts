import type { PortalOrder } from '@/portal/types'
import type { PillKind } from './format'

/**
 * A project's status — one value, in priority order.
 *
 * These conditions overlap in the real portfolio: 7 orders are both past their
 * contractual date and waiting on the customer, and 7 more are both on hold and
 * late. So a status has to be a single answer arrived at by priority, not a set of
 * flags, or the filter and the badge on the card would disagree — you would select
 * "Past contractual date" and get cards labelled "On hold".
 *
 * This function is the only place that decision is made, and both the card and the
 * filter read it. That is what makes them consistent by construction.
 *
 * The order of precedence answers "what should this customer do about it?":
 *
 *   on hold        nothing is moving, and that outranks how late it is
 *   past date      the schedule has slipped and they need to know
 *   action needed  a drawing is sitting with them, and only they can clear it
 *   on track       nothing to report
 */
export const PROJECT_STATUSES = [
  { key: 'hold', label: 'On hold', kind: 'warn' },
  { key: 'late', label: 'Past contractual date', kind: 'bad' },
  { key: 'action', label: 'Action needed', kind: 'warn' },
  { key: 'ontrack', label: 'On track', kind: 'ok' },
] as const

export type ProjectStatusKey = (typeof PROJECT_STATUSES)[number]['key']
export type StatusFilter = ProjectStatusKey | 'all'

export interface ProjectStatus {
  readonly key: ProjectStatusKey
  readonly label: string
  readonly kind: PillKind
}

export function projectStatus(order: PortalOrder): ProjectStatus {
  const key: ProjectStatusKey = order.hold
    ? 'hold'
    : order.late
      ? 'late'
      : order.await
        ? 'action'
        : 'ontrack'
  return PROJECT_STATUSES.find((s) => s.key === key)! as ProjectStatus
}

export function byStatus(orders: readonly PortalOrder[], status: StatusFilter): PortalOrder[] {
  if (status === 'all') return [...orders]
  return orders.filter((o) => projectStatus(o).key === status)
}

/** How many projects sit in each status, for the filter's own labels. */
export function statusCounts(orders: readonly PortalOrder[]): Record<ProjectStatusKey, number> {
  const counts = { hold: 0, late: 0, action: 0, ontrack: 0 }
  for (const o of orders) counts[projectStatus(o).key] += 1
  return counts
}
