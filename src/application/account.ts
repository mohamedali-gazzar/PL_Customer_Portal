/**
 * Account context — the smallest read model in the app.
 *
 * The Finance and Documents screens need nothing except the page chrome and the
 * reason they are empty. Pulling a whole portfolio to render that would be wasteful
 * and would make an unavailable screen more expensive than a useful one, so this
 * fetches only the source description and the account name.
 *
 * The unavailability blocks come from `capabilities()`, which is synchronous and
 * costs nothing — availability is declared, never probed.
 */

import type { CustomerId } from '@/domain'
import type { CachedResult } from '@/ports/cache-store'
import { toDataSourceDto, unavailabilityFor } from '@/dto/mapper'
import type { AccountContextDto } from '@/dto/account'
import type { AppDeps } from './deps'


export async function getAccountContext(
  deps: AppDeps,
  customerId: CustomerId,
): Promise<CachedResult<AccountContextDto>> {
  // No date in the key: nothing here changes with the calendar.
  return deps.cache.readModel('documents', customerId, ['account'], () =>
    composeAccountContext(deps, customerId),
  )
}

export async function composeAccountContext(
  deps: AppDeps,
  customerId: CustomerId,
): Promise<AccountContextDto> {
  const capabilities = deps.provider.capabilities()
  const [sourceInfo, customer] = await Promise.all([
    deps.provider.sourceInfo(),
    deps.provider.getCustomer(customerId),
  ])
  const unavailability = unavailabilityFor(capabilities)

  return {
    source: toDataSourceDto(sourceInfo),
    customer: { displayName: customer?.displayName.raw ?? '' },
    unavailable: {
      finance: unavailability.finance,
      documents: unavailability.documents,
      delivery: unavailability.delivery,
      plannedDates: unavailability.plannedDates,
    },
  }
}
