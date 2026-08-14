/**
 * The thin BFF wrapper every portal route goes through.
 *
 * All four security-relevant steps happen here, once, rather than being repeated
 * (and eventually forgotten) in each route:
 *
 *  1. Resolve the session. No tenant is available to a handler until this succeeds,
 *     so a route cannot read a customer from the query string. PDF §7.1.
 *  2. Open a metrics scope, so provider calls and cache outcomes are counted.
 *  3. Log one structured audit line per request with a hashed tenant. PDF §7.5.
 *  4. Attach `Server-Timing` outside production so the numbers are visible in
 *     devtools.
 */

import { hashTenantForLogs } from '@/providers'
import type { PortalSession } from '@/ports/session'
import { getDevSessionResolver } from '@/infra/session/dev-session'
import { toServerTiming, withRequestMetrics } from '@/infra/metrics/request-metrics'
import { JsonLogger, NULL_LOGGER } from '@/infra/logger'

/**
 * PDF §7.5 requires an audit log of every customer request, so this is on by
 * default. `PORTAL_LOG_SILENT=1` mutes it for the test suite only — the audit trail
 * is verified by its own assertions rather than by scrolling test output.
 */
const logger = process.env.PORTAL_LOG_SILENT === '1' ? NULL_LOGGER : new JsonLogger({ component: 'bff' })

export interface HandlerContext {
  readonly session: PortalSession
  readonly request: Request
}

export type PortalHandler<T> = (context: HandlerContext) => Promise<T | NotFound>

/** Returned by a handler when the resource does not exist *or* is not this tenant's. */
export const NOT_FOUND = Symbol('not-found')
export type NotFound = typeof NOT_FOUND

export async function handlePortalRequest<T>(
  route: string,
  request: Request,
  handler: PortalHandler<T>,
): Promise<Response> {
  const session = await getDevSessionResolver().resolve(request)

  if (session === null) {
    return json({ error: 'unauthenticated' }, 401)
  }

  const tenantHash = hashTenantForLogs(session.customerId)

  try {
    const { value, metrics } = await withRequestMetrics({ route, tenantHash }, async () =>
      handler({ session, request }),
    )

    if (value === NOT_FOUND) {
      // Deliberately 404, not 403: a 403 would confirm the id exists and belongs to
      // somebody else, which is an information leak in itself.
      logger.log('info', 'portal.request', { route, tenantHash, status: 404, ...flat(metrics) })
      return json({ error: 'not_found' }, 404)
    }

    const body = JSON.stringify(value)
    const response = json(JSON.parse(body) as unknown, 200)
    logger.log('info', 'portal.request', {
      route,
      tenantHash,
      status: 200,
      bytes: body.length,
      ...flat(metrics),
    })
    if (process.env.NODE_ENV !== 'production') {
      response.headers.set('Server-Timing', toServerTiming(metrics))
    }
    return response
  } catch (error) {
    logger.log('error', 'portal.request.failed', {
      route,
      tenantHash,
      message: error instanceof Error ? error.message : String(error),
    })
    // Never surface an internal message: it can name file paths and ERPNext fields.
    return json({ error: 'internal_error' }, 500)
  }
}

function flat(metrics: {
  providerCalls: number
  providerMs: number
  cache: Record<string, number>
  composeMs: number
  totalMs: number
}): Record<string, unknown> {
  return {
    providerCalls: metrics.providerCalls,
    providerMs: metrics.providerMs,
    cacheHit: metrics.cache.hit,
    cacheStale: metrics.cache.stale,
    cacheMiss: metrics.cache.miss,
    composeMs: metrics.composeMs,
    totalMs: metrics.totalMs,
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Customer-specific data must never be cached by a shared proxy or CDN.
      'cache-control': 'private, no-store',
    },
  })
}
