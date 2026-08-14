/**
 * What the sign-in screen needs before anyone has signed in.
 *
 * In demo mode that includes the headline statistics and the customer picker; in
 * production it is the as-of date and nothing more. The decision is made in
 * `gatewayView`, not here, so there is one place to check.
 */

import { getSnapshot } from '@/server/snapshot'
import { gatewayView } from '@/portal/scope'
import { config } from '@/server/config'
import { serverError } from '@/server/auth'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    const cfg = config()
    const snapshot = await getSnapshot(cfg)
    return Response.json(gatewayView(snapshot, cfg.demoMode), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (cause) {
    return serverError('bootstrap', cause)
  }
}
