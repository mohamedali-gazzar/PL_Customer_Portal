/**
 * The internal PM console's data: every customer, unscoped.
 *
 * Deliberately a separate route from the customer one, reached only after the
 * staff role is asserted. Widening a customer's view would take editing this
 * file, not passing a different argument to a shared one.
 */

import { currentSession, forbidden, serverError, unauthorized } from '@/server/auth'
import { getSnapshot } from '@/server/snapshot'
import { consoleView } from '@/portal/scope'
import { config } from '@/server/config'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    const session = await currentSession()
    if (!session) return unauthorized()
    if (session.role !== 'staff') return forbidden('The PM console is for Powerline staff.')

    const snapshot = await getSnapshot(config())
    return Response.json(consoleView(snapshot), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (cause) {
    return serverError('console snapshot', cause)
  }
}
