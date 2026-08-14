import type { CustomerId } from '@/domain'

/**
 * The tenant boundary.
 *
 * PDF §7.1: "every BFF endpoint resolves the customer ID from the JWT session —
 * never from a request parameter."
 *
 * `SessionResolver` takes the incoming request and returns a session, and a
 * session is the *only* thing in the codebase that yields a `CustomerId` for a
 * request. A route handler has no other way to obtain one, so it cannot read a
 * tenant from the query string even by mistake.
 */
export interface PortalSession {
  readonly customerId: CustomerId
  readonly contactEmail: string
  readonly permissions: {
    readonly viewProgress: boolean
    /** PDF §6.1: the "admin contact" flag. Engineers see progress only. */
    readonly viewFinance: boolean
  }
  readonly locale: 'en' | 'ar'
}

export interface SessionResolver {
  readonly kind: string
  resolve(request: Request): Promise<PortalSession | null>
}
