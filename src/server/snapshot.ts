/**
 * Snapshot access, cached.
 *
 * Brief §7.6: customer traffic must never degrade the ERP for factory users. Every
 * screen therefore reads a cached snapshot rather than the source, and the source
 * is consulted at most once per refresh window however many customers are online.
 *
 * Two layers, doing different jobs:
 *
 *   - a process-local memo, which makes a warm request cost nothing at all;
 *   - the shared `CacheStore`, so that on Vercel a cold lambda inherits a snapshot
 *     a warm one already paid for, instead of re-reading the ERP.
 *
 * Recomputation is single-flight: a hundred simultaneous requests on a cold cache
 * produce one read, not a hundred. That is the difference between a cache and a
 * stampede.
 */

import { Redis } from '@upstash/redis'
import { MemoryCacheStore } from '@/infra/cache/memory-store'
import { UpstashCacheStore } from '@/infra/cache/upstash-store'
import { cacheKey, type CacheStore } from '@/ports/cache-store'
import type { PortalSnapshot } from '@/portal/types'
import { loadXlsxSnapshot } from '@/providers/xlsx'
import { loadSnapshotFromUrl } from '@/providers/snapshot-url'
import { loadErpNextSnapshot } from '@/providers/erpnext/provider'
import { config, type PortalConfig } from './config'

const SNAPSHOT_KEY = cacheKey('portal', 'snapshot', 'v1')

let store: CacheStore | null = null

function cacheStore(cfg: PortalConfig): CacheStore {
  if (store) return store
  store =
    cfg.cacheDriver === 'upstash' && cfg.upstash
      ? new UpstashCacheStore(new Redis({ url: cfg.upstash.url, token: cfg.upstash.token }))
      : new MemoryCacheStore()
  return store
}

interface Memo {
  snapshot: PortalSnapshot
  freshUntil: number
}

let memo: Memo | null = null
let inFlight: Promise<PortalSnapshot> | null = null

async function readSource(cfg: PortalConfig): Promise<PortalSnapshot> {
  if (cfg.provider === 'erpnext') return loadErpNextSnapshot(cfg)
  if (cfg.provider === 'snapshot') return loadSnapshotFromUrl(cfg.snapshotUrl!)

  const { snapshot, warnings } = await loadXlsxSnapshot(cfg.excelPath)
  for (const w of warnings) console.warn(`[portal] ${w}`)
  return snapshot
}

/**
 * The current snapshot.
 *
 * Serves a fresh memo immediately; otherwise consults the shared store; otherwise
 * recomputes, once, while everyone else waits on the same promise.
 */
export async function getSnapshot(cfg: PortalConfig = config()): Promise<PortalSnapshot> {
  const now = Date.now()
  if (memo && memo.freshUntil > now) return memo.snapshot
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const store = cacheStore(cfg)
      const cached = await store.get<PortalSnapshot>(SNAPSHOT_KEY)
      if (cached && cached.freshUntil > Date.now()) {
        memo = { snapshot: cached.value, freshUntil: cached.freshUntil }
        return cached.value
      }

      const snapshot = await readSource(cfg)
      const freshMs = cfg.snapshotFreshSeconds * 1000
      await store.set(SNAPSHOT_KEY, snapshot, {
        freshMs,
        staleMs: cfg.snapshotStaleSeconds * 1000,
      })
      memo = { snapshot, freshUntil: Date.now() + freshMs }
      return snapshot
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/**
 * Drop the cached snapshot.
 *
 * Called by the ERPNext webhook endpoint when a Work Order, Stock Entry, Delivery
 * Note, Sales Invoice, Payment Entry or RFD is submitted, so a customer sees a
 * milestone move within seconds rather than at the end of the refresh window.
 */
export async function invalidateSnapshot(cfg: PortalConfig = config()): Promise<void> {
  memo = null
  await cacheStore(cfg).delete(SNAPSHOT_KEY)
}

/** Test support. */
export function resetSnapshotCache(): void {
  memo = null
  inFlight = null
  store = null
}
