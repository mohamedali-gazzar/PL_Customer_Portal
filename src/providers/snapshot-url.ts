/**
 * The snapshot provider: an already-derived snapshot, fetched over HTTPS.
 *
 * This exists because of a conflict the other two providers cannot resolve. The
 * Excel provider reads a file from local disk, and that file is real customer data
 * which must never enter version control — so it is not in the repository, and
 * therefore not in any deployment built from the repository. The ERPNext provider
 * is the real answer, but until the ERP is reachable from the host there is nothing
 * for it to read.
 *
 * So: derive locally, where the export legitimately lives, publish the result to
 * storage the deployment can reach, and point at it. The data never touches git,
 * the deployment holds no spreadsheet, and the derivation is still the same
 * verified code that produced it.
 *
 *   npm run build:snapshot          → data/portal-snapshot.json
 *   upload it                       → Vercel Blob, S3, anywhere private
 *   PORTAL_SNAPSHOT_URL=https://…   → the deployment reads it
 *
 * Refreshing the portal after a new export is then: re-run, re-upload. No deploy.
 */

import type { PortalSnapshot } from '@/portal/types'

export class SnapshotSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SnapshotSourceError'
  }
}

/**
 * Check the payload is actually a portal snapshot before it becomes one.
 *
 * A misconfigured URL usually returns something that parses as JSON — a login
 * page, an error envelope, an empty object from a bucket that 404s politely. Any
 * of those would otherwise surface as a portal where every customer's orders had
 * silently vanished, which is the one failure this codebase exists to prevent.
 */
function assertSnapshot(value: unknown, source: string): asserts value is PortalSnapshot {
  const bad = (why: string): never => {
    throw new SnapshotSourceError(
      `The document at ${source} is not a portal snapshot: ${why}. ` +
        `Expected the output of \`npm run build:snapshot\`.`,
    )
  }

  if (typeof value !== 'object' || value === null) bad('it is not an object')
  const s = value as Record<string, unknown>

  if (!Array.isArray(s.items)) bad('it has no items array')
  if (!Array.isArray(s.orders)) bad('it has no orders array')
  if (!Array.isArray(s.customers)) bad('it has no customers array')
  if (typeof s.meta !== 'object' || s.meta === null) bad('it has no meta object')

  const meta = s.meta as Record<string, unknown>
  if (typeof meta.exportDate !== 'string') bad('meta.exportDate is missing')

  // An empty snapshot parses perfectly and reads to every customer as "nothing has
  // happened on your order". Refuse it.
  if ((s.items as unknown[]).length === 0) bad('it contains no item lines')
}

export async function loadSnapshotFromUrl(url: string, timeoutMs = 15_000): Promise<PortalSnapshot> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      signal: controller.signal,
      // The snapshot's freshness is managed by our own cache, not the CDN's.
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  } catch (cause) {
    const reason =
      cause instanceof Error && cause.name === 'AbortError'
        ? `it did not respond within ${timeoutMs}ms`
        : cause instanceof Error
          ? cause.message
          : String(cause)
    throw new SnapshotSourceError(`Could not fetch the portal snapshot from ${url}: ${reason}.`)
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    throw new SnapshotSourceError(
      `Could not fetch the portal snapshot from ${url}: the server returned ${response.status}. ` +
        (response.status === 403 || response.status === 401
          ? 'The URL needs to be readable by the deployment — check the token or make the object readable.'
          : 'Check PORTAL_SNAPSHOT_URL points at the uploaded file.'),
    )
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new SnapshotSourceError(`The document at ${url} is not valid JSON.`)
  }

  assertSnapshot(parsed, url)
  return parsed
}
