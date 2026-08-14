/**
 * Request instrumentation port.
 *
 * Performance is a stated hard requirement, so provider call counts and cache
 * outcomes are recorded from the first milestone rather than added later. The
 * counters are asserted in tests: `tests/performance/call-budget.test.ts` fails
 * if anyone reintroduces a per-item provider call, which is the failure mode that
 * would make the ERPNext provider slow.
 */

export type CacheOutcome = 'hit' | 'stale' | 'miss' | 'bypass'

export interface ProviderCallRecord {
  readonly method: string
  readonly durationMs: number
}

export interface MetricsSnapshot {
  readonly route: string
  /** Hashed, never the raw tenant key — request logs must not become a customer list. */
  readonly tenantHash: string | null
  readonly providerCalls: number
  readonly providerMs: number
  readonly calls: readonly ProviderCallRecord[]
  readonly cache: Readonly<Record<CacheOutcome, number>>
  readonly composeMs: number
  readonly totalMs: number
  readonly payloadBytes: number | null
}

export interface RequestMetrics {
  recordProviderCall(method: string, durationMs: number): void
  recordCache(outcome: CacheOutcome, key: string): void
  recordCompose(durationMs: number): void
  recordPayloadBytes(bytes: number): void
  snapshot(): MetricsSnapshot
}
