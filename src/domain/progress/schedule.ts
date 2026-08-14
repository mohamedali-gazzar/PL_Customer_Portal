/**
 * Schedule position against the contractual date.
 *
 * Deliberately conservative wording. The temporary source cannot observe
 * delivery, so the portal must not claim an order is "late" — only that its
 * contractual date has passed, which is a fact about the calendar and true
 * regardless of what the source knows about delivery.
 */

import { known, notInSource, isKnown, type Maybe } from '../model/maybe'
import { diffDays, type PlainDate } from '../model/plain-date'
import type { Project } from '../model/entities'

export type ScheduleState = 'on_track' | 'due_soon' | 'past_contractual_date'

export interface ScheduleStatus {
  readonly state: ScheduleState
  readonly contractualDate: PlainDate
  /** Negative once the date has passed. */
  readonly daysToContractual: number
}

const DUE_SOON_DAYS = 30

/**
 * Always recomputed against the injected `today`.
 *
 * The export ships frozen `Age Since SO` and `Days To Contractual` columns
 * calculated as of 2026-08-11. Those are never surfaced — a stale countdown is
 * worse than none, and it silently drifts by one day for every day the snapshot
 * ages.
 */
export function deriveSchedule(project: Project, today: PlainDate): Maybe<ScheduleStatus> {
  if (!isKnown(project.contractualDate)) {
    return notInSource('no contractual date on this order (missing on 35% of rows in the export)')
  }
  const contractualDate = project.contractualDate.value
  const daysToContractual = diffDays(today, contractualDate)

  const state: ScheduleState =
    daysToContractual < 0
      ? 'past_contractual_date'
      : daysToContractual <= DUE_SOON_DAYS
        ? 'due_soon'
        : 'on_track'

  return known({ state, contractualDate, daysToContractual })
}

/** Days since the order was placed, recomputed live for the same reason. */
export function deriveOrderAgeDays(project: Project, today: PlainDate): Maybe<number> {
  if (!isKnown(project.orderedOn)) return notInSource('no order date')
  return known(diffDays(project.orderedOn.value, today))
}
