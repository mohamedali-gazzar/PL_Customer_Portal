/**
 * The session cookie — the portal's trust boundary.
 *
 * Brief §7.1: every endpoint resolves the customer from the session, never from a
 * request parameter. That rule is only worth anything if the session itself cannot
 * be forged, so the cookie is HMAC-signed and verified in constant time. A
 * customer who edits the cookie to name a different company gets a 401, not
 * somebody else's orders.
 *
 * This is signing, not encryption: the payload is readable by whoever holds the
 * cookie, which is fine — it names only the customer the holder is already
 * entitled to see. It is deliberately not a bearer token for anything else.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'pl_portal_session'

export type Role = 'customer' | 'staff'

export interface Session {
  readonly role: Role
  /** The tenant. Present for customers, absent for staff, who see every tenant. */
  readonly customer: string | null
  /** Who signed in, for the audit log. */
  readonly email: string
  /** Issued at, epoch seconds. */
  readonly iat: number
  /** Expires at, epoch seconds. */
  readonly exp: number
}

const b64url = {
  encode: (s: string) => Buffer.from(s, 'utf8').toString('base64url'),
  decode: (s: string) => Buffer.from(s, 'base64url').toString('utf8'),
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/** Constant-time compare, so a wrong signature leaks nothing through timing. */
function signatureMatches(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function issueSession(
  input: { role: Role; customer: string | null; email: string },
  secret: string,
  ttlSeconds: number,
  now: () => number = Date.now,
): { value: string; session: Session } {
  const iat = Math.floor(now() / 1000)
  const session: Session = {
    role: input.role,
    customer: input.role === 'customer' ? input.customer : null,
    email: input.email,
    iat,
    exp: iat + ttlSeconds,
  }
  const payload = b64url.encode(JSON.stringify(session))
  return { value: `${payload}.${sign(payload, secret)}`, session }
}

/**
 * Recover a session from a cookie value.
 *
 * Returns `null` for anything not provably ours and unexpired. Every failure is
 * the same `null`: a caller cannot distinguish "tampered" from "expired" from
 * "malformed", so none of those states can be probed.
 */
export function readSession(
  cookieValue: string | undefined | null,
  secret: string,
  now: () => number = Date.now,
): Session | null {
  if (!cookieValue) return null
  const dot = cookieValue.lastIndexOf('.')
  if (dot <= 0) return null

  const payload = cookieValue.slice(0, dot)
  const signature = cookieValue.slice(dot + 1)
  if (!signatureMatches(signature, sign(payload, secret))) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(b64url.decode(payload))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const s = parsed as Record<string, unknown>
  if (s.role !== 'customer' && s.role !== 'staff') return null
  if (typeof s.exp !== 'number' || typeof s.iat !== 'number') return null
  if (s.exp * 1000 <= now()) return null

  const customer = typeof s.customer === 'string' ? s.customer : null
  // A customer session with no tenant can see nothing; treat it as invalid rather
  // than as "all tenants", which is the failure mode that matters.
  if (s.role === 'customer' && !customer) return null

  return {
    role: s.role,
    customer: s.role === 'customer' ? customer : null,
    email: typeof s.email === 'string' ? s.email : '',
    iat: s.iat,
    exp: s.exp,
  }
}

export function sessionCookieOptions(production: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: production,
    path: '/',
    maxAge: maxAgeSeconds,
  }
}
