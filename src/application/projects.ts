/**
 * Projects list read model.
 *
 * Same single portfolio read as the dashboard, cached under its own key. Both
 * screens therefore cost one provider read each when cold and none when warm; no
 * per-project call exists in either path.
 */

import { isKnown, rollUpProject, type CustomerId } from '@/domain'
import type { CachedResult } from '@/ports/cache-store'
import { metrics, timed } from '@/infra/metrics/request-metrics'
import {
  dateDto,
  mapMaybeDto,
  toDataSourceDto,
  toMaybeDto,
  toProgressDto,
  toScheduleDto,
  unavailabilityFor,
} from '@/dto/mapper'
import type { ProjectsListDto } from '@/dto/projects'
import type { AppDeps } from './deps'
import { UnknownCustomerError } from './dashboard'


export async function getProjects(
  deps: AppDeps,
  customerId: CustomerId,
): Promise<CachedResult<ProjectsListDto>> {
  return deps.cache.readModel('projects', customerId, [deps.clock.today()], () =>
    composeProjects(deps, customerId),
  )
}

export async function composeProjects(deps: AppDeps, customerId: CustomerId): Promise<ProjectsListDto> {
  const capabilities = deps.provider.capabilities()
  const today = deps.clock.today()

  const [sourceInfo, portfolio] = await Promise.all([
    deps.provider.sourceInfo(),
    deps.provider.getPortfolio(customerId),
  ])
  if (portfolio === null) throw new UnknownCustomerError(customerId)

  const { value: items, ms } = await timed(async () =>
    portfolio.projects.map((project) => {
      const rollup = rollUpProject(project, capabilities, today)
      return {
        id: project.id,
        salesOrderNo: project.salesOrderNo,
        displayName: project.displayName.raw,
        projectCode: toMaybeDto(project.projectCode),
        customerPoNo: toMaybeDto(project.customerPoNo),
        projectManager: mapMaybeDto(project.projectManager, (pm) => pm.displayName),
        orderedOn: dateDto(project.orderedOn),
        contractualDate: dateDto(project.contractualDate),
        schedule: toScheduleDto(rollup.schedule),
        progress: toProgressDto(rollup.progress),
        itemCount: rollup.itemCounts.total,
        awaitingCustomer: rollup.lines.filter((l) => isKnown(l.timeline.blockedOnCustomer)).length,
      }
    }),
  )
  metrics().recordCompose(ms)

  const unavailability = unavailabilityFor(capabilities)
  return {
    source: toDataSourceDto(sourceInfo),
    customer: { displayName: portfolio.customer.displayName.raw },
    projects: items,
    unavailable: { finance: unavailability.finance, delivery: unavailability.delivery },
  }
}
