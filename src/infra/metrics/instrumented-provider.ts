import type { PortalDataProvider } from '@/ports/data-provider'
import { metrics } from './request-metrics'

const UNMEASURED = new Set(['id', 'capabilities'])

/**
 * Wrap any provider so every call to it is counted and timed.
 *
 * Provider-agnostic on purpose: the Excel provider is instrumented today, which
 * means the call-budget tests are already meaningful and the ERPNext provider
 * arrives into a harness that is measuring it from its first request. The number
 * that matters — how many backend round-trips one screen costs — is therefore a
 * test assertion rather than something discovered in production.
 */
export function withMetrics(provider: PortalDataProvider): PortalDataProvider {
  return new Proxy(provider, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function' || typeof property !== 'string' || UNMEASURED.has(property)) {
        return value
      }
      return function instrumented(this: unknown, ...args: unknown[]) {
        const startedAt = Date.now()
        const label = `${provider.id}.${property}`
        let result: unknown
        try {
          result = (value as (...a: unknown[]) => unknown).apply(target, args)
        } catch (error) {
          metrics().recordProviderCall(`${label}!throw`, Date.now() - startedAt)
          throw error
        }
        if (result instanceof Promise) {
          return result.then(
            (resolved) => {
              metrics().recordProviderCall(label, Date.now() - startedAt)
              return resolved
            },
            (error: unknown) => {
              metrics().recordProviderCall(`${label}!reject`, Date.now() - startedAt)
              throw error
            },
          )
        }
        metrics().recordProviderCall(label, Date.now() - startedAt)
        return result
      }
    },
  })
}
