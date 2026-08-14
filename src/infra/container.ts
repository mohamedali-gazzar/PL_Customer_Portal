/**
 * Composition root.
 *
 * The only place that knows which provider and which cache driver are active. It
 * is also where instrumentation is attached, so every provider is measured
 * identically and no adapter has to know it is being timed.
 */

import {
  assertIdentitySafeForProduction,
  ExcelBacklogProvider,
  FixtureProvider,
  IDENTITY_ASSURANCE,
} from '@/providers'
import type { PortalDataProvider } from '@/ports/data-provider'
import type { Clock } from '@/ports/clock'
import type { CacheStore } from '@/ports/cache-store'
import type { AppDeps } from '@/application/deps'
import { loadConfig, type PortalConfig } from './config'
import { SystemClock } from './clock'
import { JsonLogger } from './logger'
import { MemoryCacheStore } from './cache/memory-store'
import { UpstashCacheStore } from './cache/upstash-store'
import { TenantCache } from './cache/tenant-cache'
import { withMetrics } from './metrics/instrumented-provider'

export interface ContainerOverrides {
  readonly provider?: PortalDataProvider
  readonly clock?: Clock
  readonly cacheStore?: CacheStore
  readonly cacheEnabled?: boolean
  readonly scheduleBackground?: (work: () => Promise<void>) => void
}

let cached: AppDeps | null = null

/**
 * Process-wide dependencies.
 *
 * Memoised so the Excel snapshot and the cache survive between requests in one
 * process. Pass overrides to build an isolated set (tests, scripts) — that call
 * never touches the memo.
 */
export function getAppDeps(overrides?: ContainerOverrides): AppDeps {
  if (overrides !== undefined) return build(loadConfig(), overrides)
  if (cached === null) cached = build(loadConfig(), {})
  return cached
}

export function resetAppDeps(): void {
  cached = null
}

function build(config: PortalConfig, overrides: ContainerOverrides): AppDeps {
  const provider = overrides.provider ?? createProvider(config)
  const store = overrides.cacheStore ?? createCacheStore(config)

  const cache = new TenantCache(store, {
    freshMs: config.cacheFreshMs,
    staleMs: config.cacheStaleMs,
    ...(overrides.cacheEnabled === undefined ? {} : { enabled: overrides.cacheEnabled }),
    ...(overrides.scheduleBackground === undefined
      ? {}
      : { scheduleBackground: overrides.scheduleBackground }),
  })

  return {
    // Instrumented here, once, so provider call counts are recorded whatever the
    // implementation — including the Excel provider, which is why the call-budget
    // tests are meaningful before ERPNext exists.
    provider: withMetrics(provider),
    cache,
    clock: overrides.clock ?? new SystemClock(),
    logger: new JsonLogger({ provider: provider.id, cache: store.driver }),
  }
}

function createProvider(config: PortalConfig): PortalDataProvider {
  switch (config.provider) {
    case 'excel':
      // Decision D1: while this provider is active the tenant key is derived from
      // the customer name. Approved for the prototype, blocked for production — so
      // a production build refuses to start rather than risk a name edit in ERPNext
      // silently splitting or merging two tenants.
      assertIdentitySafeForProduction(IDENTITY_ASSURANCE)
      return new ExcelBacklogProvider({ filePath: config.excelPath })
    case 'fixture':
      return new FixtureProvider()
    case 'erpnext':
      throw new Error(
        'PORTAL_DATA_PROVIDER=erpnext: the ERPNext provider arrives in M6. ' +
          'It implements the same PortalDataProvider port, so only this switch changes.',
      )
  }
}

function createCacheStore(config: PortalConfig): CacheStore {
  return config.cacheDriver === 'upstash' ? UpstashCacheStore.fromEnv() : new MemoryCacheStore()
}
