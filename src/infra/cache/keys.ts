import { createHash } from 'node:crypto'
import type { CustomerId, ProjectId } from '@/domain'
import type { CacheKey, ReadModelName } from '@/ports/cache-store'

/**
 * Cache keys.
 *
 * `CacheKey` is branded and `CacheStore` accepts nothing else, so a raw string
 * cannot be used as a key. Every constructor below requires a `CustomerId`, and
 * `CustomerId` can only come from a verified session — which makes "cache keys
 * are tenant-scoped" a property of the type system rather than a convention
 * somebody has to remember. One customer's payload cannot land under another
 * customer's key.
 *
 * Key shape:
 *
 *   portal:s{SCHEMA_VERSION}:t:{tenant}:g:{generation}:rm:{name}[:{parts}]
 *
 * - `SCHEMA_VERSION` is bumped whenever a DTO or a business rule changes, which
 *   invalidates everything on deploy. Without it, a rule fix would keep serving
 *   payloads computed by the old rules until their TTL expired.
 * - `generation` is a per-tenant counter. A webhook increments it and every one
 *   of that tenant's entries becomes unreachable at once — O(1), no SCAN, and no
 *   window where a tenant sees a mix of old and new payloads.
 */

/**
 * Bump on any change to a DTO shape or to a domain rule that affects output.
 * Treat it as part of the deploy: a stale-but-differently-shaped payload is worse
 * than a cache miss.
 */
export const SCHEMA_VERSION = 1

const PREFIX = `portal:s${SCHEMA_VERSION}`

/** Tenant keys are hashed into cache keys so a customer name never reaches Redis. */
function tenantSegment(customerId: CustomerId): string {
  return createHash('sha256').update(customerId, 'utf8').digest('hex').slice(0, 24)
}

/** Sanitise a key part; ids are already validated, this is belt and braces. */
function part(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96)
}

/**
 * The generation counter for a tenant. Deliberately outside the generation-scoped
 * namespace — it is the thing the other keys are versioned by, so it must survive
 * its own bump.
 */
export function generationKey(customerId: CustomerId): CacheKey {
  return `${PREFIX}:t:${tenantSegment(customerId)}:gen` as CacheKey
}

export function readModelKey(
  customerId: CustomerId,
  generation: number,
  name: ReadModelName,
  ...parts: string[]
): CacheKey {
  const suffix = parts.length > 0 ? `:${parts.map(part).join(':')}` : ''
  return `${PREFIX}:t:${tenantSegment(customerId)}:g:${generation}:rm:${name}${suffix}` as CacheKey
}

export function projectDetailKey(
  customerId: CustomerId,
  generation: number,
  projectId: ProjectId,
): CacheKey {
  return readModelKey(customerId, generation, 'project-detail', projectId)
}

/** Lock companion for a key, used for single-flight recomputation. */
export function lockKey(key: CacheKey): CacheKey {
  return `${key}:lock` as CacheKey
}

/**
 * Every key must name a tenant. Asserted by
 * `tests/security/cache-isolation.test.ts` over all key builders, so a future
 * builder that forgets the tenant segment fails the build.
 */
export function keyIncludesTenant(key: CacheKey, customerId: CustomerId): boolean {
  return key.includes(`:t:${tenantSegment(customerId)}`)
}
