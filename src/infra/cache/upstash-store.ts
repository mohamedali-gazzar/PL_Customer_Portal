import { Redis } from '@upstash/redis'
import type { CacheKey, CacheEntry, CacheStore, CacheWriteOptions } from '@/ports/cache-store'

interface Envelope<T> {
  v: T
  s: number
  f: number
}

/**
 * Upstash Redis (REST) store — the production cache decided in PDF §3.
 *
 * Two details worth noting:
 *
 * - Freshness is carried *inside* the value, while Redis holds the hard TTL. That
 *   is what makes stale-while-revalidate possible: the key survives past its
 *   fresh window so a stale value can be served instantly while a background
 *   refresh runs, instead of every expiry becoming a slow request.
 * - `acquireLock` uses `SET NX PX`, so a cache expiry under load produces one
 *   upstream recomputation rather than one per concurrent request.
 */
export class UpstashCacheStore implements CacheStore {
  readonly driver = 'upstash' as const

  private readonly redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): UpstashCacheStore {
    const url = env.UPSTASH_REDIS_REST_URL
    const token = env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) {
      throw new Error(
        'PORTAL_CACHE_DRIVER=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
      )
    }
    return new UpstashCacheStore(new Redis({ url, token }))
  }

  async get<T>(key: CacheKey): Promise<CacheEntry<T> | null> {
    const raw = await this.redis.get<Envelope<T>>(key)
    if (raw === null || typeof raw !== 'object') return null
    return { value: raw.v, storedAt: raw.s, freshUntil: raw.f }
  }

  async set<T>(key: CacheKey, value: T, options: CacheWriteOptions): Promise<void> {
    const now = Date.now()
    const envelope: Envelope<T> = { v: value, s: now, f: now + options.freshMs }
    await this.redis.set(key, envelope, { px: options.staleMs })
  }

  async delete(key: CacheKey): Promise<void> {
    await this.redis.del(key)
  }

  async increment(key: CacheKey): Promise<number> {
    return this.redis.incr(key)
  }

  async readCounter(key: CacheKey): Promise<number | null> {
    const value = await this.redis.get<number | string>(key)
    if (value === null) return null
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  async acquireLock(key: CacheKey, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', { nx: true, px: ttlMs })
    return result === 'OK'
  }

  async releaseLock(key: CacheKey): Promise<void> {
    await this.redis.del(key)
  }
}
