/**
 * Project-level rollups. PDF §6.2 asks for "overall % complete (weighted by
 * items)" on each dashboard card.
 */

import { known, notInSource, isKnown, type Maybe } from '../model/maybe'
import type { PlainDate } from '../model/plain-date'
import type { ProviderCapabilities } from '../model/capabilities'
import type { ItemTimeline, OrderLine, Project } from '../model/entities'
import type { StageId } from '../model/milestone'
import { buildTimeline } from '../milestones/timeline'
import { deriveSchedule, type ScheduleStatus } from './schedule'

export interface LineWithTimeline {
  readonly line: OrderLine
  readonly timeline: ItemTimeline
}

export interface ProjectProgress {
  readonly percent: Maybe<number>
  /** The stages the percentage covers — must be shown alongside the number. */
  readonly basis: readonly StageId[]
  /** How many lines contributed, and how many exist. Prevents a silent partial rollup. */
  readonly linesCounted: number
  readonly linesTotal: number
}

export interface ProjectRollup {
  readonly lines: readonly LineWithTimeline[]
  readonly progress: ProjectProgress
  readonly schedule: Maybe<ScheduleStatus>
  readonly attention: AttentionFlags
  readonly itemCounts: ItemCounts
}

export interface AttentionFlags {
  /** At least one item is waiting on the customer (drawing approval). */
  readonly awaitingCustomer: number
  readonly pastContractualDate: boolean
}

export interface ItemCounts {
  readonly total: number
  readonly manufactured: number
  readonly suppliedComponents: number
  /**
   * Deliberately absent as a number.
   *
   * The mockup shows an "ITEMS DELIVERED 1 / 4" tile. With an open-backlog
   * source, delivered lines are excluded from the export entirely, so any such
   * count would read as 0/4 on every project — a false statement. The capability
   * flag carries the reason instead.
   */
  readonly delivered: Maybe<number>
}

export function rollUpProject(
  project: Project,
  capabilities: ProviderCapabilities,
  today: PlainDate,
): ProjectRollup {
  const lines: LineWithTimeline[] = project.lines.map((line) => ({
    line,
    timeline: buildTimeline(line, capabilities, today),
  }))

  return {
    lines,
    progress: rollUpProgress(lines),
    schedule: deriveSchedule(project, today),
    attention: {
      awaitingCustomer: lines.filter((l) => isKnown(l.timeline.blockedOnCustomer)).length,
      pastContractualDate: pastContractual(project, today),
    },
    itemCounts: countItems(project.lines, capabilities),
  }
}

/**
 * Quantity-weighted mean of the per-item percentages.
 *
 * Only lines with a derivable percentage are counted; loose-component lines have
 * no production journey and would otherwise drag every project toward zero.
 * `linesCounted` vs `linesTotal` makes that exclusion visible rather than silent.
 */
export function rollUpProgress(lines: readonly LineWithTimeline[]): ProjectProgress {
  const counted = lines.filter((l) => isKnown(l.timeline.progressPercent))

  if (counted.length === 0) {
    return {
      percent: notInSource('no item in this project has a derivable stage in this source'),
      basis: [],
      linesCounted: 0,
      linesTotal: lines.length,
    }
  }

  let weightSum = 0
  let weighted = 0
  for (const l of counted) {
    const percent = l.timeline.progressPercent
    if (!isKnown(percent)) continue
    const weight = Math.max(l.line.quantity.ordered, 1)
    weightSum += weight
    weighted += percent.value * weight
  }

  // Union of the per-line bases: if any counted line could only be derived over
  // stages 1–3, the project number covers stages 1–3.
  const basis = [...new Set(counted.flatMap((l) => l.timeline.progressBasis))].sort(
    (a, b) => a - b,
  ) as StageId[]

  return {
    percent: known(Math.round(weighted / weightSum)),
    basis,
    linesCounted: counted.length,
    linesTotal: lines.length,
  }
}

function pastContractual(project: Project, today: PlainDate): boolean {
  const schedule = deriveSchedule(project, today)
  return isKnown(schedule) && schedule.value.state === 'past_contractual_date'
}

function countItems(
  lines: readonly OrderLine[],
  capabilities: ProviderCapabilities,
): ItemCounts {
  const delivered: Maybe<number> =
    capabilities.scope === 'open_backlog_only'
      ? notInSource(
          'this source contains open backlog only — delivered lines are excluded, ' +
            'so a delivered count would always read as zero',
        )
      : known(lines.filter((l) => isKnown(l.quantity.delivered) && l.quantity.delivered.value > 0).length)

  return {
    total: lines.length,
    manufactured: lines.filter((l) => l.itemClass === 'manufactured').length,
    suppliedComponents: lines.filter((l) => l.itemClass === 'supplied_component').length,
    delivered,
  }
}
