/**
 * Project detail read model, including every item's full 7-stage timeline.
 *
 * One provider read for the project and all its items. The 27-line project in the
 * export costs exactly the same number of backend calls as a 1-line project — the
 * property the call-budget test pins down, because it is what will decide whether
 * this screen is fast against ERPNext.
 */

import {
  isKnown,
  rollUpProject,
  STAGE_KEYS,
  type CustomerId,
  type LineWithTimeline,
  type Project,
  type ProjectId,
  type ProjectRollup,
  type ProviderCapabilities,
} from '@/domain'
import type { CachedResult } from '@/ports/cache-store'
import { metrics, timed } from '@/infra/metrics/request-metrics'
import {
  dateDto,
  mapMaybeDto,
  toBlockedDto,
  toDataSourceDto,
  toItemProgressDto,
  toMaybeDto,
  toMilestoneDtos,
  toProgressDto,
  toScheduleDto,
  unavailabilityFor,
} from '@/dto/mapper'
import type { ProjectDetailDto, ProjectHeaderDto, ProjectItemDto } from '@/dto/project-detail'
import type { AppDeps } from './deps'

export async function getProjectDetail(
  deps: AppDeps,
  customerId: CustomerId,
  projectId: ProjectId,
): Promise<CachedResult<ProjectDetailDto | null>> {
  return deps.cache.readModel('project-detail', customerId, [projectId, deps.clock.today()], () =>
    composeProjectDetail(deps, customerId, projectId),
  )
}

export async function composeProjectDetail(
  deps: AppDeps,
  customerId: CustomerId,
  projectId: ProjectId,
): Promise<ProjectDetailDto | null> {
  const capabilities = deps.provider.capabilities()
  const today = deps.clock.today()

  /*
   * Three reads, issued together, and flat: none of them depends on the number of
   * items. `getCustomer` supplies the account name for the page header — it is a
   * tenant-level lookup, not a per-item one, so the no-N+1 property is unaffected.
   */
  const [sourceInfo, customer, project] = await Promise.all([
    deps.provider.sourceInfo(),
    deps.provider.getCustomer(customerId),
    // The provider resolves ownership. `null` covers both "no such project" and
    // "belongs to another customer" — the caller cannot tell them apart, so a
    // probing request learns nothing.
    deps.provider.getProject(customerId, projectId),
  ])

  if (project === null) return null

  const { value: rollup, ms } = await timed(async () => rollUpProject(project, capabilities, today))
  metrics().recordCompose(ms)

  const unavailability = unavailabilityFor(capabilities)

  return {
    source: toDataSourceDto(sourceInfo),
    customer: { displayName: customer?.displayName.raw ?? '' },
    project: toHeader(project, rollup),
    items: rollup.lines.map((line) => toItem(line, capabilities)),
    unavailable: {
      finance: unavailability.finance,
      documents: unavailability.documents,
      delivery: unavailability.delivery,
      fat: unavailability.fat,
      plannedDates: unavailability.plannedDates,
    },
  }
}

function toHeader(project: Project, rollup: ProjectRollup): ProjectHeaderDto {
  return {
    id: project.id,
    salesOrderNo: project.salesOrderNo,
    displayName: project.displayName.raw,
    projectCode: toMaybeDto(project.projectCode),
    customerPoNo: toMaybeDto(project.customerPoNo),
    orderedOn: dateDto(project.orderedOn),
    contractualPeriodDays: toMaybeDto(project.contractualPeriodDays),
    contractualDate: dateDto(project.contractualDate),
    schedule: toScheduleDto(rollup.schedule),
    // Decision D2: display name only. No employee email, phone or id is modelled,
    // so none can be forwarded here.
    projectManager: mapMaybeDto(project.projectManager, (pm) => pm.displayName),
    progress: toProgressDto(rollup.progress),
    itemCounts: {
      total: rollup.itemCounts.total,
      manufactured: rollup.itemCounts.manufactured,
      suppliedComponents: rollup.itemCounts.suppliedComponents,
      delivered: toMaybeDto(rollup.itemCounts.delivered),
    },
    attention: {
      awaitingCustomer: rollup.attention.awaitingCustomer,
      pastContractualDate: rollup.attention.pastContractualDate,
    },
  }
}

function toItem(entry: LineWithTimeline, capabilities: ProviderCapabilities): ProjectItemDto {
  const { line, timeline } = entry

  /*
   * Item codes on supplied-component lines are supplier part numbers (ABB codes
   * such as 1SDA066317R1 appear in the export), and PDF §7.3 forbids supplier data
   * reaching the portal. Until the open decision on component lines is settled, the
   * code is withheld and the description carries the item.
   */
  const itemCode =
    line.itemClass === 'supplied_component'
      ? ({ known: false, reason: 'restricted' } as const)
      : toMaybeDto(line.itemCode)

  return {
    id: line.id,
    itemCode,
    itemName: line.itemName,
    itemClass: line.itemClass,
    hasProductionJourney: line.production !== null,
    quantity: {
      ordered: line.quantity.ordered,
      remaining: toMaybeDto(line.quantity.remaining),
      produced: toMaybeDto(line.quantity.produced),
    },
    cubicles: toMaybeDto(line.cubicles),
    currentStage: mapMaybeDto(timeline.currentStage, (s) => s),
    progress: toItemProgressDto(timeline),
    nextMilestone: mapMaybeDto(timeline.nextMilestone, (n) => ({
      stage: n.stage,
      key: STAGE_KEYS[n.stage],
      plannedOn: dateDto(n.plannedOn),
    })),
    blockedOnCustomer: toBlockedDto(timeline),
    milestones: toMilestoneDtos(timeline, capabilities),
  }
}

/** Projects list — reuses the portfolio read, so it costs no extra provider call. */
export function projectSummaries(rollups: readonly { project: Project; rollup: ProjectRollup }[]) {
  return rollups.map(({ project, rollup }) => ({
    id: project.id,
    salesOrderNo: project.salesOrderNo,
    displayName: project.displayName.raw,
    itemCount: rollup.itemCounts.total,
    progress: toProgressDto(rollup.progress),
    schedule: toScheduleDto(rollup.schedule),
    awaitingCustomer: rollup.attention.awaitingCustomer,
    pastContractualDate: rollup.attention.pastContractualDate,
    contractualDate: dateDto(project.contractualDate),
    hasBlockedItems: rollup.lines.some((l) => isKnown(l.timeline.blockedOnCustomer)),
  }))
}
