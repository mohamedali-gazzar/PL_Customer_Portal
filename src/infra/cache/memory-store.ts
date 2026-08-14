import type { CacheKey, CacheEntry, CacheStore, CacheWriteOptions } from '@/ports/cache-store'

interface Slot {
  value: unknown
  storedAt: number
  freshUntil: number
  expiresAt: number
}

/**
 * In-process cache for development and tests.
 *
 * Implements the same contract as the Upstash store, including expiry semantics
 * and lock behaviour, so the stale-while-revalidate and single-flight logic above
 * it is exercised by the test suite without a Redis instance.
 */
export class MemoryCacheStore implements CacheStore {
  readonly driver = 'memory' as const

  private readonly slots = new Map<string, Slot>()
  private readonly counters = new Map<string, number>()
  private readonly locks = new Map<string, number>()
  private readonly now: () => number

  constructor(now: () => number = () => Date.now()) {
    this.now = now
  }

  async get<T>(key: CacheKey): Promise<CacheEntry<T> | null> {
    const slot = this.slots.get(key)
    if (slot === undefined) return null
    if (this.now() >= slot.expiresAt) {
      this.slots.delete(key)
      return null
    }
    return { value: slot.value as T, freshUntil: slot.freshUntil, storedAt: slot.storedAt }
  }

  async set<T>(key: CacheKey, value: T, options: CacheWriteOptions): Promise<void> {
    const t = this.now()
    this.slots.set(key, {
      value,
      storedAt: t,
      freshUntil: t + options.freshMs,
      expiresAt: t + options.staleMs,
    })
  }

  async delete(key: CacheKey): Promise<void> {
    this.slots.delete(key)
  }

  async increment(key: CacheKey): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1
    this.counters.set(key, next)
    return next
  }

  async readCounter(key: CacheKey): Promise<number | null> {
    return this.counters.get(key) ?? null
  }

  async acquireLock(key: CacheKey, ttlMs: number): Promise<boolean> {
    const held = this.locks.get(key)
    const t = this.now()
    if (held !== undefined && held > t) return false
    this.locks.set(key, t + ttlMs)
    return true
  }

  async releaseLock(key: CacheKey): Promise<void> {
    this.locks.delete(key)
  }

  /** Test support. */
  clear(): void {
    this.slots.clear()
    this.counters.clear()
    this.locks.clear()
  }

  get size(): number {
    return this.slots.size
  }

  keys(): string[] {
    return [...this.slots.keys()]
  }
}
