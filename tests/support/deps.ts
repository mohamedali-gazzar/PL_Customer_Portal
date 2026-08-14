import type { AppDeps } from '@/application/deps'
import { MemoryCacheStore } from '@/infra/cache/memory-store'
import { TenantCache } from '@/infra/cache/tenant-cache'
import { FixedClock } from '@/infra/clock'
import { NULL_LOGGER } from '@/infra/logger'
import { withMetrics } from '@/infra/metrics/instrumented-provider'
import { FixtureProvider } from '@/providers'
import { plainDate } from '@/domain'
import { TODAY } from './build'

export interface TestDeps extends AppDeps {
  readonly store: MemoryCacheStore
}

/**
 * Isolated dependencies per test: a fresh fixture provider, a fresh in-memory
 * cache and a fixed clock. Nothing is shared between tests, and nothing touches
 * the real backlog export.
 */
export function testDeps(options: { today?: string; cacheEnabled?: boolean; now?: () => number } = {}): TestDeps {
  const store = new MemoryCacheStore(options.now)
  const cache = new TenantCache(store, {
    freshMs: 60_000,
    staleMs: 300_000,
    generationMemoMs: 0, // read the generation every time, so invalidation is immediate in tests
    // Store and cache must share one clock.
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.cacheEnabled === undefined ? {} : { enabled: options.cacheEnabled }),
  })

  return {
    provider: withMetrics(new FixtureProvider()),
    cache,
    clock: new FixedClock(options.today === undefined ? TODAY : plainDate(options.today)),
    logger: NULL_LOGGER,
    store,
  }
}
