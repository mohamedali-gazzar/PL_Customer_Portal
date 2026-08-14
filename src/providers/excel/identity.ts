import { createHash } from 'node:crypto'
import { customerId, sanitizeText, type CustomerId, type IdentityAssurance } from '@/domain'

/**
 * Provisional tenant keys, derived from the customer name.
 *
 * The backlog export carries no ERPNext `Customer.name` link id — only free-text
 * names, 15 of 107 mixing Latin and Arabic script. Decision D1 approves deriving
 * a temporary key from the name for the prototype, explicitly not for production.
 *
 * Why this is a pre-production blocker and not a cosmetic gap: the key *is* the
 * name. Editing a customer's name in ERPNext produces a different key, so the
 * same company becomes a second tenant and its history disappears from the
 * portal; two spellings of one company become two tenants. Normalisation below
 * reduces the blast radius but cannot remove it — only a real customer id can.
 *
 * `IDENTITY_ASSURANCE` travels with every response so this cannot be forgotten,
 * and `assertIdentitySafeForProduction` refuses to boot a production build on a
 * provisional key.
 */

export const IDENTITY_ASSURANCE: IdentityAssurance = {
  level: 'provisional',
  source: 'derived_from_customer_name',
  risk:
    'Tenant key is derived from the customer name because the export has no ERPNext ' +
    'Customer.name. A name change in ERPNext would appear as a different customer. ' +
    'Must be replaced with the real customer id before production (blocker D1).',
}

/**
 * Fold the spelling variants that should not create separate tenants:
 * unicode presentation forms, bidi marks, case, punctuation and whitespace.
 * Arabic diacritics and tatweel are stripped for the same reason.
 */
export function normalizeCustomerName(raw: string): string {
  return sanitizeText(raw)
    .toLocaleLowerCase('en')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[.,'"`‘’“”()[\]{}]/g, '')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A stable, opaque key. Opaque so that a customer's Arabic legal name never
 * appears in a URL, a cache key or a log line.
 */
export function deriveCustomerId(rawName: string): CustomerId {
  const normalized = normalizeCustomerName(rawName)
  if (normalized === '') throw new TypeError('Cannot derive a tenant key from an empty customer name')
  const digest = createHash('sha256').update(`powerline:customer:${normalized}`, 'utf8').digest('hex')
  return customerId(`c_${digest.slice(0, 20)}`)
}

/** Short non-reversible tag for logs and metrics. Never the tenant key itself. */
export function hashTenantForLogs(id: CustomerId): string {
  return createHash('sha256').update(id, 'utf8').digest('hex').slice(0, 12)
}

/**
 * Refuse to serve customers from a provisional tenant key.
 *
 * `PORTAL_PREVIEW_MODE=1` is the one deliberate escape hatch: a staging or pilot
 * deployment legitimately needs to run a production build against the temporary export
 * — including to measure real performance — and blocking that outright would only push
 * people to weaken the check itself. Setting it is an explicit statement that the
 * deployment is not customer-facing, and it logs a warning on every boot so it cannot
 * sit forgotten in an environment that later becomes one.
 */
export function assertIdentitySafeForProduction(assurance: IdentityAssurance): void {
  if (process.env.NODE_ENV !== 'production' || assurance.level !== 'provisional') return

  if (process.env.PORTAL_PREVIEW_MODE === '1') {
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'portal.preview_mode',
        detail:
          'Running a production build on a provisional tenant identity because ' +
          'PORTAL_PREVIEW_MODE=1. Not fit for customer access. Blocker D1.',
      }),
    )
    return
  }

  throw new Error(
    `Refusing to start: tenant identity is provisional (${assurance.source}). ${assurance.risk} ` +
      `Set PORTAL_PREVIEW_MODE=1 only for a non-customer-facing staging deployment.`,
  )
}

export function isPreviewMode(): boolean {
  return process.env.PORTAL_PREVIEW_MODE === '1'
}
