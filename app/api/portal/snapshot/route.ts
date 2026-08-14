/**
 * Everything the signed-in customer's portal renders, scoped to that customer.
 *
 * One request per session rather than one per screen: the payload for a single
 * customer is small (the largest holds 42 order lines), and shipping it once means
 * navigating between Dashboard, Projects, Finance and Documents costs nothing and
 * touches neither the cache nor the ERP.
 *
 * The tenant comes from the cookie. There is no parameter that can change it.
 */

import { currentSession, forbidden, serverError, unauthorized } from '@/server/auth'
import { getSnapshot } from '@/server/snapshot'
import { scopeToCustomer } from '@/portal/scope'
import { config } from '@/server/config'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    const session = await currentSession()
    if (!session) return unauthorized()
    if (session.role !== 'customer' || !session.customer) {
      return forbidden('This is the customer portal. Staff accounts use the PM console.')
    }

    const snapshot = await getSnapshot(config())
    const scoped = scopeToCustomer(snapshot, session.customer)

    // The cookie named a customer that no longer exists — the company was renamed
    // or removed. That is a stale session, not an empty portal.
    if (!scoped) return unauthorized('Your session refers to a customer that is no longer available.')

    return Response.json(scoped, {
      headers: {
        // Tenant-specific: never store this in a shared or browser cache.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (cause) {
    return serverError('customer snapshot', cause)
  }
}
