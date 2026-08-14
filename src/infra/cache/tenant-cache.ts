/**
 * The read-model cache.
 *
 * What is cached is the **composed, already-whitelisted DTO** for a screen, not
 * the raw source data. Two consequences:
 *
 *  - A warm request is one store read plus a JSON parse: no provider calls, no
 *    domain computation, no field mapping. That is what makes a cached dashboard
 *    feel instant.
 *  - A cached payload physically cannot contain an internal field, because
 *    whitelisting happened before it was written.
 *
 * Three behaviours matter under load:
 *
 *  - **Generation-based invalidation.** The tenant's generation counter is part of
 *    every key, so a webhook bumping one integer retires all of that tenant's
 *    entries at once.
 *  - **Stale-while-revalidate.** Past its fresh window an entry is still served
 *    immediately while it refreshes in the background, so freshness costs latency
 *    only for whoever triggers the refresh — and with `scheduleBackground`, not
 *    even for them.
 *  - **Single-flight.** A local in-flight map collapses concurrent requests in one
 *    process; a store lock collapses them across instances. An expiry under load
 *    therefore causes one recomputation, not one per request.
 */

import type {
  CacheKey,
  CachedResult,
  CacheStore,
  ReadModelCache,
  ReadModelName,
} from '@/ports/cache-store'
import type { CustomerId } from '@/domain'
import { metrics } from '@/infra/metrics/request-metrics'
import { generationKey, lockKey, readModelKey } from './keys'

export interface TenantCacheOptions {
  readonly freshMs: number
  readonly staleMs: number
  /** How long one recomputation may hold the cross-instance lock. */
  readonly lockTtlMs?: number
  /** Cache the generation counter briefly to avoid a store read per request. */
  readonly generationMemoMs?: number
  /**
   * Runs work after the response is sent. In Next.js this is `after()` from
   * `next/server`; the default just detaches the promise.
   */
  readonly scheduleBackground?: (work: () => Promise<void>) => void
  /** Set false to bypass the cache entirely (scripts, cold-path measurements). */
  readonly enabled?: boolean
  /**
   * Time source, which MUST be the same one the store uses.
   *
   * The store stamps `freshUntil` and this class compares against it, so two
   * different clocks would make every entry look permanently stale — a silent
   * 100% miss rate that no functional test would catch.
   */
  readonly now?: () => number
}

const DEFAULTS = { lockTtlMs: 10_000, generationMemoMs: 1_000 }

export class TenantCache implements ReadModelCache {
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private readonly generationMemo = new Map<string, { value: number; expiresAt: number }>()
  private readonly store: CacheStore
  private readonly options: TenantCacheOptions
  private readonly now: () => number

  constructor(store: CacheStore, options: TenantCacheOptions) {
    this.store = store
    this.options = options
    this.now = options.now ?? (() => Date.now())
  }

  get driver(): string {
    return this.store.driver
  }

  /**
   * Current generation for a tenant.
   *
   * Memoised for ~1s: the counter is read on every request, and a one-second
   * window bounds how long a just-invalidated tenant can still be served from a
   * retired key while removing a store round-trip from the hot path.
   */
  async generation(customerId: CustomerId): Promise<number> {
    const key = generationKey(customerId)
    const memoMs = this.options.generationMemoMs ?? DEFAULTS.generationMemoMs
    const now = this.now()
    const memo = this.generationMemo.get(key)
    if (memo !== undefined && memo.expiresAt > now) return memo.value

    const stored = await this.store.readCounter(key)
    const value = stored ?? 0
    this.generationMemo.set(key, { value, expiresAt: now + memoMs })
    return value
  }

  /**
   * Retire every cached entry for one tenant.
   *
   * Called by the ERPNext webhook handler in M6 on submit of a Work Order, Stock
   * Entry, Delivery Note, Sales Invoice, Payment Entry or RFD.
   */
  async invalidateTenant(customerId: CustomerId): Promise<number> {
    const key = generationKey(customerId)
    const next = await this.store.increment(key)
    this.generationMemo.set(key, { value: next, expiresAt: this.now() })
    return next
  }

  async readModel<T>(
    name: ReadModelName,
    customerId: CustomerId,
    parts: readonly string[],
    compute: () => Promise<T>,
  ): Promise<CachedResult<T>> {
    if (this.options.enabled === false) {
      const value = await compute()
      metrics().recordCache('bypass', name)
      return { value, outcome: 'bypass', key: `${name}:bypass` }
    }

    const generation = await this.generation(customerId)
    const key = readModelKey(customerId, generation, name, ...parts)

    const entry = await this.store.get<T>(key)
    if (entry !== null) {
      if (this.now() < entry.freshUntil) {
        metrics().recordCache('hit', key)
        return { value: entry.value, outcome: 'hit', key }
      }
      // Stale: answer now, refresh behind the response.
      metrics().recordCache('stale', key)
      this.revalidateInBackground(key, compute)
      return { value: entry.value, outcome: 'stale', key }
    }

    metrics().recordCache('miss', key)
    const value = await this.computeOnce(key, compute)
    return { value, outcome: 'miss', key }
  }

  /** Collapse concurrent misses for the same key into one computation. */
  private async computeOnce<T>(key: CacheKey, compute: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key)
    if (existing !== undefined) return existing as Promise<T>

    const promise = (async () => {
      const lockTtl = this.options.lockTtlMs ?? DEFAULTS.lockTtlMs
      const gotLock = await this.store.acquireLock(lockKey(key), lockTtl)
      try {
        if (!gotLock) {
          // Another instance is computing. Give it a moment, then use its result
          // if it landed. Never wait indefinitely — a slow peer must not become
          // this request's latency, so fall through and compute.
          const retry = await this.store.get<T>(key)
          if (retry !== null) return retry.value
        }
        const value = await compute()
        await this.store.set(key, value, {
          freshMs: this.options.freshMs,
          staleMs: this.options.staleMs,
        })
        return value
      } finally {
        if (gotLock) await this.store.releaseLock(lockKey(key))
        this.inFlight.delete(key)
      }
    })()

    this.inFlight.set(key, promise)
    return promise
  }

  private revalidateInBackground<T>(key: CacheKey, compute: () => Promise<T>): void {
    if (this.inFlight.has(key)) return
    const work = async (): Promise<void> => {
      try {
        await this.computeOnce(key, compute)
      } catch {
        // A failed refresh must never surface: the caller already has a usable
        // stale value, and the entry expires on its own if refreshes keep failing.
      }
    }
    const schedule = this.options.scheduleBackground
    if (schedule !== undefined) schedule(work)
    else void work()
  }
}
