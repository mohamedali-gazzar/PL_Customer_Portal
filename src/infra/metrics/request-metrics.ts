/**
 * Per-request instrumentation.
 *
 * Held in an `AsyncLocalStorage` so any layer can record a measurement without
 * threading a metrics object through every signature — which matters because the
 * thing most worth counting (provider calls) happens several layers below the
 * route handler.
 *
 * What is measured: provider call count and duration, cache outcome, compose
 * time, total time, payload size. Provider call count is the number that predicts
 * ERPNext load, so it is asserted in tests rather than merely logged.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type {
  CacheOutcome,
  MetricsSnapshot,
  ProviderCallRecord,
  RequestMetrics,
} from '@/ports/metrics'

class MutableRequestMetrics implements RequestMetrics {
  private readonly startedAt = Date.now()
  private readonly callRecords: ProviderCallRecord[] = []
  private readonly cacheCounts: Record<CacheOutcome, number> = { hit: 0, stale: 0, miss: 0, bypass: 0 }
  private composeMs = 0
  private payloadBytes: number | null = null
  private readonly route: string
  private readonly tenantHash: string | null

  constructor(route: string, tenantHash: string | null) {
    this.route = route
    this.tenantHash = tenantHash
  }

  recordProviderCall(method: string, durationMs: number): void {
    this.callRecords.push({ method, durationMs })
  }

  recordCache(outcome: CacheOutcome, _key: string): void {
    void _key
    this.cacheCounts[outcome] += 1
  }

  recordCompose(durationMs: number): void {
    this.composeMs += durationMs
  }

  recordPayloadBytes(bytes: number): void {
    this.payloadBytes = bytes
  }

  snapshot(): MetricsSnapshot {
    return {
      route: this.route,
      tenantHash: this.tenantHash,
      providerCalls: this.callRecords.length,
      providerMs: Math.round(this.callRecords.reduce((sum, c) => sum + c.durationMs, 0)),
      calls: [...this.callRecords],
      cache: { ...this.cacheCounts },
      composeMs: Math.round(this.composeMs),
      totalMs: Date.now() - this.startedAt,
      payloadBytes: this.payloadBytes,
    }
  }
}

/** A sink used when nothing has opened a metrics scope (scripts, unit tests). */
const NOOP: RequestMetrics = {
  recordProviderCall: () => {},
  recordCache: () => {},
  recordCompose: () => {},
  recordPayloadBytes: () => {},
  snapshot: () => ({
    route: 'none',
    tenantHash: null,
    providerCalls: 0,
    providerMs: 0,
    calls: [],
    cache: { hit: 0, stale: 0, miss: 0, bypass: 0 },
    composeMs: 0,
    totalMs: 0,
    payloadBytes: null,
  }),
}

const storage = new AsyncLocalStorage<RequestMetrics>()

/** The ambient metrics recorder, or a no-op sink outside a scope. */
export function metrics(): RequestMetrics {
  return storage.getStore() ?? NOOP
}

/**
 * Run `fn` inside a fresh metrics scope and return both its value and the
 * measurements. Route handlers and the verification script use this.
 */
export async function withRequestMetrics<T>(
  options: { route: string; tenantHash?: string | null },
  fn: (recorder: RequestMetrics) => Promise<T>,
): Promise<{ value: T; metrics: MetricsSnapshot }> {
  const recorder = new MutableRequestMetrics(options.route, options.tenantHash ?? null)
  const value = await storage.run(recorder, () => fn(recorder))
  return { value, metrics: recorder.snapshot() }
}

/** Measure an awaited step and fold it into the compose budget. */
export async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const startedAt = Date.now()
  const value = await fn()
  return { value, ms: Date.now() - startedAt }
}

/**
 * Compact `Server-Timing` value. Emitted on responses outside production so the
 * numbers are visible in devtools without reading logs.
 */
export function toServerTiming(snapshot: MetricsSnapshot): string {
  const cacheState =
    snapshot.cache.hit > 0 ? 'hit' : snapshot.cache.stale > 0 ? 'stale' : 'miss'
  return [
    `total;dur=${snapshot.totalMs}`,
    `provider;dur=${snapshot.providerMs};desc="${snapshot.providerCalls} calls"`,
    `compose;dur=${snapshot.composeMs}`,
    `cache;desc="${cacheState}"`,
  ].join(', ')
}
