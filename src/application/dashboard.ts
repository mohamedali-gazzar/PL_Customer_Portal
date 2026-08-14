/**
 * Dashboard read model.
 *
 * One provider read for the whole screen. There is no loop over projects and no
 * loop over items — the portfolio arrives as a single aggregate and everything
 * else is pure computation. That is what keeps the backend call count flat as a
 * customer's order book grows, and it is asserted in
 * `tests/performance/call-budget.test.ts`.
 */

import {
  isKnown,
  rollUpProject,
  STAGE_KEYS,
  type CustomerId,
  type Project,
  type ProjectRollup,
} from '@/domain'
import type { CachedResult } from '@/ports/cache-store'
import { timed, metrics } from '@/infra/metrics/request-metrics'
import {
  dateDto,
  mapMaybeDto,
  toBlockedDto,
  toDataSourceDto,
  toMaybeDto,
  toProgressDto,
  toScheduleDto,
  unavailabilityFor,
} from '@/dto/mapper'
import type { DashboardDto, DashboardProjectCardDto, DashboardSummaryDto } from '@/dto/dashboard'
import type { AppDeps } from './deps'

/** Cached entry point. Use this from a route; `composeDashboard` is the cold path. */
export async function getDashboard(
  deps: AppDeps,
  customerId: CustomerId,
): Promise<CachedResult<DashboardDto>> {
  // The calendar day is part of the key: the payload contains day counters
  // ("awaiting your approval for 12 days"), so an entry must not outlive its day.
  return deps.cache.readModel('dashboard', customerId, [deps.clock.today()], () =>
    composeDashboard(deps, customerId),
  )
}

export async function composeDashboard(
  deps: AppDeps,
  customerId: CustomerId,
): Promise<DashboardDto> {
  const capabilities = deps.provider.capabilities()
  const today = deps.clock.today()

  const [sourceInfo, portfolio] = await Promise.all([
    deps.provider.sourceInfo(),
    deps.provider.getPortfolio(customerId),
  ])

  if (portfolio === null) {
    throw new UnknownCustomerError(customerId)
  }

  const { value: rollups, ms } = await timed(async () =>
    portfolio.projects.map((project) => ({
      project,
      rollup: rollUpProject(project, capabilities, today),
    })),
  )
  metrics().recordCompose(ms)

  const unavailability = unavailabilityFor(capabilities)

  return {
    source: toDataSourceDto(sourceInfo),
    customer: { displayName: portfolio.customer.displayName.raw },
    summary: summarise(rollups.map((r) => r.rollup), capabilities.scope),
    projects: rollups.map(({ project, rollup }) => toCard(project, rollup)),
    unavailable: {
      finance: unavailability.finance,
      documents: unavailability.documents,
      delivery: unavailability.delivery,
      // Surfaced to the customer-facing layer so the provisional tenant key
      // (decision D1) is visible in the UI rather than only in a document.
      identity:
        sourceInfo.identityAssurance.level === 'provisional'
          ? { code: 'source.provisional_identity', scope: 'identity' }
          : null,
    },
  }
}

export class UnknownCustomerError extends Error {
  constructor(customerId: CustomerId) {
    // The id is a hash, not a name, so it is safe in an error message.
    super(`No portfolio for tenant ${customerId}`)
    this.name = 'UnknownCustomerError'
  }
}

function summarise(
  rollups: readonly ProjectRollup[],
  scope: 'full_order_book' | 'open_backlog_only',
): DashboardSummaryDto {
  const allLines = rollups.flatMap((r) => r.lines)

  const inManufacturing = allLines.filter((l) => {
    const status = l.timeline.milestones[3].status
    return isKnown(status) && status.value === 'in_progress'
  }).length

  const completedManufacturing = allLines.filter((l) => l.timeline.milestones[3].isComplete).length

  return {
    activeProjects: rollups.length,
    itemsTotal: allLines.length,
    itemsInManufacturing: inManufacturing,
    itemsCompletedManufacturing: completedManufacturing,
    awaitingYourApproval: allLines.filter((l) => isKnown(l.timeline.blockedOnCustomer)).length,
    projectsPastContractualDate: rollups.filter((r) => r.attention.pastContractualDate).length,
    // Never a number while the source is an open-backlog snapshot: delivered
    // lines are absent from it, so a count would read as zero on every project.
    itemsDelivered:
      scope === 'open_backlog_only'
        ? { known: false, reason: 'not_in_source' }
        : { known: true, value: rollups.reduce((sum, r) => sum + deliveredCount(r), 0) },
  }
}

function deliveredCount(rollup: ProjectRollup): number {
  const delivered = rollup.itemCounts.delivered
  return isKnown(delivered) ? delivered.value : 0
}

function toCard(project: Project, rollup: ProjectRollup): DashboardProjectCardDto {
  // The first item waiting on the customer, used for the card's action banner.
  const blockedLine = rollup.lines.find((l) => isKnown(l.timeline.blockedOnCustomer))

  return {
    id: project.id,
    salesOrderNo: project.salesOrderNo,
    displayName: project.displayName.raw,
    projectCode: toMaybeDto(project.projectCode),
    customerPoNo: toMaybeDto(project.customerPoNo),
    // Display name only — decision D2.
    projectManager: mapMaybeDto(project.projectManager, (pm) => pm.displayName),
    orderedOn: dateDto(project.orderedOn),
    contractualDate: dateDto(project.contractualDate),
    schedule: toScheduleDto(rollup.schedule),
    progress: toProgressDto(rollup.progress),
    itemCount: rollup.itemCounts.total,
    nextMilestone: nextMilestoneOf(rollup),
    attention: {
      awaitingCustomer: rollup.attention.awaitingCustomer,
      pastContractualDate: rollup.attention.pastContractualDate,
    },
    blockedExample:
      blockedLine === undefined
        ? { known: false, reason: 'pending' }
        : toBlockedDto(blockedLine.timeline),
  }
}

/**
 * The project's next milestone is the earliest next milestone across its items —
 * the soonest thing due, which is what the mockup's "Next milestone" line shows.
 */
function nextMilestoneOf(rollup: ProjectRollup): DashboardProjectCardDto['nextMilestone'] {
  const candidates = rollup.lines
    .map((l) => l.timeline.nextMilestone)
    .filter(isKnown)
    .map((m) => m.value)

  if (candidates.length === 0) return { known: false, reason: 'pending' }

  // Prefer the earliest planned date; fall back to the earliest stage number when
  // no date is known, which is common in this source.
  const dated = candidates.filter((c) => isKnown(c.plannedOn))
  const chosen =
    dated.length > 0
      ? dated.reduce((a, b) =>
          isKnown(a.plannedOn) && isKnown(b.plannedOn) && a.plannedOn.value <= b.plannedOn.value ? a : b,
        )
      : candidates.reduce((a, b) => (a.stage <= b.stage ? a : b))

  return {
    known: true,
    value: {
      stage: chosen.stage,
      key: STAGE_KEYS[chosen.stage],
      plannedOn: dateDto(chosen.plannedOn),
    },
  }
}
