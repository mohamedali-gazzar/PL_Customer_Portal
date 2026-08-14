import type { Clock } from '@/ports/clock'
import type { Logger } from '@/ports/logger'
import type { PortalDataProvider } from '@/ports/data-provider'
import type { ReadModelCache } from '@/ports/cache-store'

/**
 * Everything a composer needs, passed in.
 *
 * No composer reaches for a module-level singleton, so a test can run one against
 * the fixture provider with a fixed clock and an empty cache and get a
 * deterministic result.
 */
export interface AppDeps {
  readonly provider: PortalDataProvider
  /** The port, not the concrete `TenantCache` — composers stay infra-agnostic. */
  readonly cache: ReadModelCache
  readonly clock: Clock
  readonly logger: Logger
}
