/**
 * Branded identifiers.
 *
 * `CustomerId` is the tenant key. Branding it means a plain string cannot be
 * passed where a tenant is expected, so an id arriving from a request body or
 * query parameter cannot reach a provider call or a cache key without an
 * explicit, greppable conversion.
 */

declare const CustomerIdBrand: unique symbol
declare const ProjectIdBrand: unique symbol
declare const OrderLineIdBrand: unique symbol
declare const ContactIdBrand: unique symbol

export type CustomerId = string & { readonly [CustomerIdBrand]: true }
export type ProjectId = string & { readonly [ProjectIdBrand]: true }
export type OrderLineId = string & { readonly [OrderLineIdBrand]: true }
export type ContactId = string & { readonly [ContactIdBrand]: true }

/**
 * Only ever called where a customer identity has been *established* —
 * i.e. from a provider building its own snapshot, or from a verified session.
 * Never call this on request input; see `ports/session.ts`.
 */
export function customerId(value: string): CustomerId {
  return assertNonEmpty(value, 'CustomerId') as CustomerId
}

export function projectId(value: string): ProjectId {
  return assertNonEmpty(value, 'ProjectId') as ProjectId
}

export function orderLineId(value: string): OrderLineId {
  return assertNonEmpty(value, 'OrderLineId') as OrderLineId
}

export function contactId(value: string): ContactId {
  return assertNonEmpty(value, 'ContactId') as ContactId
}

function assertNonEmpty(value: string, kind: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${kind} must be a non-empty string`)
  }
  return value
}

/**
 * Project ids double as URL segments, so anything arriving from a route
 * parameter is validated for shape before use — and then still checked for
 * tenant ownership by the provider. Shape validation is not authorisation.
 */
export function parseProjectIdParam(raw: unknown): ProjectId | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.length > 64) return null
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return null
  return trimmed as ProjectId
}
