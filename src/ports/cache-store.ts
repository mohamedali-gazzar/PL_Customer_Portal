/**
 * The cache storage port.
 *
 * `MemoryCacheStore` backs development and tests; `UpstashCacheStore` backs
 * production, as the brief's §3 hosting decision requires. Everything above this
 * interface is written once and runs against either.
 *
 * `CacheKey` is branded so a bare string cannot be passed as a key by accident:
 * every key must come from a builder that has already applied the tenant scope.
 * That makes "cache entries are tenant-scoped" a property of the type system
 * rather than a convention someone has to remember on a busy afternoon.
 */

declare const CacheKeyBrand: unique symbol
export type CacheKey = string & { readonly [CacheKeyBrand]: true }

/** The only way to mint a key. Callers pass the tenant scope explicitly. */
export function cacheKey(scope: string, ...parts: readonly string[]): CacheKey {
  return [scope, ...parts].map((p) => encodeURIComponent(p)).join(':') as CacheKey
}

export interface CacheEntry<T> {
  readonly value: T
  /** Epoch ms. Past this the entry is stale but may still be served. */
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
   * Atomic increment, for per-tenant generation counters.
   *
   * Invalidation is O(1): an ERPNext webhook bumps one integer and every cached
   * entry for that tenant becomes unreachable, because the generation forms part
   * of the key. No SCAN, no key enumeration, and no window in which a partial
   * flush leaves a tenant looking at a mix of old and new data.
   */
  increment(key: CacheKey): Promise<number>
  readCounter(key: CacheKey): Promise<number | null>

  /** Best-effort lock for single-flight recomputation. `false` means someone else holds it. */
  acquireLock(key: CacheKey, ttlMs: number): Promise<boolean>
  releaseLock(key: CacheKey): Promise<void>
}
