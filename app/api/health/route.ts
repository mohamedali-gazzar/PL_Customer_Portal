/**
 * Liveness and readiness.
 *
 * Readiness means "can actually serve a customer", so it exercises the data path
 * rather than merely returning 200. A portal that answers health checks while its
 * data source is unreachable is worse than one that admits it is down.
 */

import { config } from '@/server/config'
import { getSnapshot } from '@/server/snapshot'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const started = Date.now()
  try {
    const cfg = config()
    const snapshot = await getSnapshot(cfg)
    return Response.json({
      status: 'ok',
      provider: cfg.provider,
      cache: cfg.cacheDriver,
      demoMode: cfg.demoMode,
      asOf: snapshot.meta.exportDate,
      orders: snapshot.meta.orders,
      itemLines: snapshot.meta.rows,
      customers: snapshot.meta.customers,
      ms: Date.now() - started,
    })
  } catch (cause) {
    return Response.json(
      {
        status: 'unavailable',
        detail: cause instanceof Error ? cause.message : String(cause),
        ms: Date.now() - started,
      },
      { status: 503 },
    )
  }
}
