import { cookies } from 'next/headers'
import type { PortalSession } from '@/ports/session'
import { getDevSessionResolver } from './dev-session'

/**
 * The session for the current Server Component render.
 *
 * Pages call this instead of receiving a tenant as a route parameter, so a page has
 * the same single route to a `CustomerId` that the API routes have (PDF §7.1). There
 * is no page prop, search parameter or path segment anywhere in the UI that names a
 * customer.
 *
 * Returns `null` in production rather than throwing: the dev resolver refuses to run
 * there, and an unauthenticated render should show the sign-in page, not a 500.
 */
export async function currentSession(): Promise<PortalSession | null> {
  if (!authIsConfigured()) return null
  const resolver = getDevSessionResolver()
  const store = await cookies()
  return resolver.resolveToken(store.get(resolver.cookieName())?.value ?? null)
}

export function authIsConfigured(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.PORTAL_PREVIEW_MODE === '1'
}
