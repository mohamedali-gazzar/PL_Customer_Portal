/**
 * Cache ports.
 *
 * `CacheStore` is the storage adapter — `MemoryCacheStore` for development and
 * tests, `UpstashCacheStore` for production. `ReadModelCache` is the strategy the
 * application layer talks to, so composers depend on this interface rather than on
 * the concrete `TenantCache`.
 *
 * `CacheKey` is branded and `CacheStore` accepts nothing else, so a raw string
 * cannot be used as a key. Every builder in `infra/cache/keys.ts` requires a
 * `CustomerId`, which makes "cache keys are tenant-scoped" a fact about the types
 * rather than a rule someone has to remember.
 */

import type { CustomerId } from '@/domain'

declare const CacheKeyBrand: unique symbol
export type CacheKey = string & { readonly [CacheKeyBrand]: true }

export type ReadModelName = 'dashboard' | 'projects' | 'project-detail' | 'finance' | 'documents'

export interface CacheEntry<T> {
  readonly value: T
  /** Epoch ms. Past this the entry is stale but still servable. */
  readonly freshUntil: number
  readonly storedAt: number
}

export interface CacheWriteOptions {
  /** How long the entry may be served without revalidation. */
  readonly freshMs: number
  /** How long it may be served stale while revalidating. Also the hard TTL. */
  readonly staleMs: number
}

export interface CacheStore {
  readonly driver: 'memory' | 'upstash'

  get<T>(key: CacheKey): Promise<CacheEntry<T> | null>
  set<T>(key: CacheKey, value: T, options: CacheWriteOptions): Promise<void>
  delete(key: CacheKey): Promise<void>

  /**
   * Atomic increment, used for per-tenant generation counters.
   *
   * Invalidation is O(1): a webhook bumps one integer and every cached entry for
   * that tenant becomes unreachable, because the generation is part of the key.
   * No SCAN, no key enumeration, and no window in which a partial flush leaves a
   * tenant with a mix of old and new payloads.
   */
  increment(key: CacheKey): Promise<number>
  readCounter(key: CacheKey): Promise<number | null>

  /** Best-effort lock for single-flight recomputation. `false` means someone else holds it. */
  acquireLock(key: CacheKey, ttlMs: number): Promise<boolean>
  releaseLock(key: CacheKey): Promise<void>
}

export type CacheOutcomeName = 'hit' | 'stale' | 'miss' | 'bypass'

export interface CachedResult<T> {
  readonly value: T
  readonly outcome: CacheOutcomeName
  readonly key: string
}

/** What the application layer uses. Implemented by `infra/cache/TenantCache`. */
export interface ReadModelCache {
  readonly driver: string
  generation(customerId: CustomerId): Promise<number>
  /** Retire every cached entry for one tenant. Called by the ERPNext webhook in M6. */
  invalidateTenant(customerId: CustomerId): Promise<number>
  readModel<T>(
    name: ReadModelName,
    customerId: CustomerId,
    parts: readonly string[],
    compute: () => Promise<T>,
  ): Promise<CachedResult<T>>
}
