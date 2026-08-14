/**
 * Development-only session.
 *
 * Real authentication (password hashing, OTP, lockout, the admin-contact flag) is
 * M5 work, and the temporary source has no contact or email data to provision
 * logins from. This exists so M3 can be exercised end-to-end through the real code
 * path — a session yields the tenant, the tenant reaches the provider, the tenant
 * scopes the cache key.
 *
 * Two properties are kept identical to the eventual JWT resolver, because they are
 * the ones that matter for correctness:
 *
 *  - The tenant comes from a signed cookie, never from a query parameter, header or
 *    body. PDF §7.1.
 *  - The cookie is HMAC-signed, so a customer cannot edit it to become another
 *    tenant. This is not "no auth in dev" — it is the same trust boundary with a
 *    simpler credential.
 *
 * It refuses to run in production.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { customerId as toCustomerId, type CustomerId } from '@/domain'
import type { PortalSession, SessionResolver } from '@/ports/session'

const COOKIE_NAME = 'pl_dev_session'

interface DevSessionPayload {
  readonly t: string
  readonly e: string
  readonly f: boolean
  readonly l: 'en' | 'ar'
}

export class DevSessionResolver implements SessionResolver {
  readonly kind = 'dev-cookie'

  private readonly secret: string

  constructor(secret: string) {
    this.secret = secret
    // Gated on the same deliberate flag as the provisional-identity check: both guard
    // against the same thing — a deployment running on temporary plumbing.
    if (process.env.NODE_ENV === 'production' && process.env.PORTAL_PREVIEW_MODE !== '1') {
      throw new Error(
        'DevSessionResolver must not run in production. Real authentication is M5 work. ' +
          'Set PORTAL_PREVIEW_MODE=1 only for a non-customer-facing staging deployment.',
      )
    }
    if (secret.trim() === '') {
      throw new Error('DEV_SESSION_SECRET is required to sign dev session cookies.')
    }
  }

  async resolve(request: Request): Promise<PortalSession | null> {
    return this.resolveToken(readCookie(request.headers.get('cookie'), COOKIE_NAME))
  }

  /**
   * Verify a raw cookie value.
   *
   * Split out from `resolve` so Server Components can reach the session through
   * `next/headers` without fabricating a `Request`. Both paths run the same
   * signature check, so page rendering and the API enforce the tenant boundary
   * identically — there is no second, weaker route to a `CustomerId`.
   */
  resolveToken(token: string | null): PortalSession | null {
    if (token === null) return null
    const payload = this.verify(token)
    if (payload === null) return null
    return {
      customerId: toCustomerId(payload.t),
      contactEmail: payload.e,
      permissions: { viewProgress: true, viewFinance: payload.f },
      locale: payload.l,
    }
  }

  /** Mint a cookie value. Used by the dev sign-in route and the verify script. */
  issue(options: {
    customerId: CustomerId
    contactEmail?: string
    viewFinance?: boolean
    locale?: 'en' | 'ar'
  }): string {
    const payload: DevSessionPayload = {
      t: options.customerId,
      e: options.contactEmail ?? 'dev@localhost',
      f: options.viewFinance ?? false,
      l: options.locale ?? 'en',
    }
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    return `${body}.${this.sign(body)}`
  }

  cookieName(): string {
    return COOKIE_NAME
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url')
  }

  private verify(token: string): DevSessionPayload | null {
    const dot = token.lastIndexOf('.')
    if (dot <= 0) return null
    const body = token.slice(0, dot)
    const signature = token.slice(dot + 1)

    const expected = Buffer.from(this.sign(body), 'utf8')
    const actual = Buffer.from(signature, 'utf8')
    // Constant-time compare, and a length check first because timingSafeEqual
    // throws on differing lengths.
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

    try {
      const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      if (typeof parsed !== 'object' || parsed === null) return null
      const p = parsed as Record<string, unknown>
      if (typeof p.t !== 'string' || p.t === '') return null
      return {
        t: p.t,
        e: typeof p.e === 'string' ? p.e : 'dev@localhost',
        f: p.f === true,
        l: p.l === 'ar' ? 'ar' : 'en',
      }
    } catch {
      return null
    }
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (header === null) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=') || null
  }
  return null
}

let resolver: DevSessionResolver | null = null

export function getDevSessionResolver(): DevSessionResolver {
  if (resolver === null) {
    resolver = new DevSessionResolver(process.env.DEV_SESSION_SECRET ?? 'insecure-local-development')
  }
  return resolver
}
