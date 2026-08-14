/**
 * The Excel provider: the PM Phase Cycle Times export, as a portal snapshot.
 *
 * This is the source of truth until the ERPNext provider is connected. It is a
 * thin seam on purpose — read the file, hand the rows to the shared derivation,
 * and stop. All the business rules live in `@/portal/derive`, so both providers
 * produce statuses by exactly the same logic and cannot drift apart.
 */

import { parseBacklogWorkbook } from './excel/parse'
import { deriveSnapshot } from '@/portal/derive'
import type { PortalSnapshot } from '@/portal/types'

export interface XlsxLoadResult {
  readonly snapshot: PortalSnapshot
  /** Columns present in the file that we do not map. Worth a look, never fatal. */
  readonly warnings: readonly string[]
}

export async function loadXlsxSnapshot(path: string): Promise<XlsxLoadResult> {
  const { rows, headerWarnings } = await parseBacklogWorkbook(path)

  if (rows.length === 0) {
    throw new Error(
      `The backlog export at "${path}" has a valid header but no data rows. ` +
        `Refusing to serve an empty portal, which would read to every customer as ` +
        `"nothing has happened on your order".`,
    )
  }

  // The as-of date is recovered from the rows themselves; the filename's date is
  // only a fallback, because a filename is not evidence.
  const fallback = /(\d{4}-\d{2}-\d{2})(?!.*\d{4}-\d{2}-\d{2})/.exec(path)?.[1] ?? '1970-01-01'

  return { snapshot: deriveSnapshot(rows, fallback), warnings: headerWarnings }
}
