/**
 * Sign in, sign out.
 *
 * What this is: the session-issuing half of authentication — a signed, httpOnly,
 * expiring cookie that names exactly one tenant, which every other route trusts
 * and nothing else can forge.
 *
 * What this is not, yet: credential verification. The current data source carries
 * no contact records, so there is nobody to check a password against. Sign-in is
 * therefore gated on `PORTAL_DEMO_MODE`, and refuses outright without it — the
 * one thing worse than no authentication is authentication that looks real.
 *
 * Provisioning logins from ERPNext Customer → Contact, with password hashing, OTP,
 * lockout and the admin-contact flag that controls financial visibility, is the
 * next milestone. It replaces the body of `POST` and nothing else: every consumer
 * already reads the session, not the sign-in.
 */

import { cookies } from 'next/headers'
import { config } from '@/server/config'
import { issueSession, sessionCookieOptions, SESSION_COOKIE } from '@/server/session'
import { getSnapshot } from '@/server/snapshot'
import { serverError } from '@/server/auth'

export const dynamic = 'force-dynamic'

interface SignInBody {
  role?: unknown
  customer?: unknown
  email?: unknown
}

export async function POST(request: Request): Promise<Response> {
  try {
    const cfg = config()

    if (!cfg.demoMode) {
      return Response.json(
        {
          error: 'not_configured',
          detail:
            'Customer sign-in is not configured. Logins are provisioned from ERPNext ' +
            'Contact records, which this deployment has not been connected to yet.',
        },
        { status: 503 },
      )
    }

    const body = (await request.json().catch(() => ({}))) as SignInBody
    const role = body.role === 'staff' ? 'staff' : 'customer'
    const email = typeof body.email === 'string' ? body.email.trim() : ''

    if (role === 'staff') {
      // Demo gate only. Real staff access will use the company identity provider.
      const domain = email.split('@')[1]?.toLowerCase()
      if (!domain || domain !== cfg.staffEmailDomain) {
        return Response.json(
          {
            error: 'invalid_credentials',
            detail: `Staff sign-in requires an @${cfg.staffEmailDomain} address.`,
          },
          { status: 401 },
        )
      }
      return await grant('staff', null, email, cfg.sessionSecret, cfg.sessionTtlSeconds, cfg.production)
    }

    const customer = typeof body.customer === 'string' ? body.customer.trim() : ''
    if (!customer) {
      return Response.json({ error: 'invalid_request', detail: 'Choose a customer.' }, { status: 400 })
    }

    // The tenant must exist. Resolving it here means the cookie can only ever name
    // a real customer, so downstream code never has to defend against a made-up one.
    const snapshot = await getSnapshot(cfg)
    if (!snapshot.customers.some((c) => c.name === customer)) {
      return Response.json({ error: 'invalid_credentials', detail: 'Unknown customer.' }, { status: 401 })
    }

    return await grant('customer', customer, email || 'demo@customer', cfg.sessionSecret, cfg.sessionTtlSeconds, cfg.production)
  } catch (cause) {
    return serverError('sign-in', cause)
  }
}

async function grant(
  role: 'customer' | 'staff',
  customer: string | null,
  email: string,
  secret: string,
  ttl: number,
  production: boolean,
): Promise<Response> {
  const { value, session } = issueSession({ role, customer, email }, secret, ttl)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, value, sessionCookieOptions(production, ttl))
  return Response.json({ role: session.role, customer: session.customer, exp: session.exp })
}

export async function DELETE(): Promise<Response> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  return Response.json({ ok: true })
}
