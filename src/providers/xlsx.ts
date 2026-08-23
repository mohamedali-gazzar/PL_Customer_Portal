/**
 * The Excel provider: the PM Phase Cycle Times export, as a portal snapshot.
 *
 * This is the source of truth until the ERPNext provider is connected. It is a
 * thin seam on purpose — read the file, hand the rows to the shared derivation,
 * and stop. All the business rules live in `@/portal/derive`, so both providers
 * produce statuses by exactly the same logic and cannot drift apart.
 */

import { DELIVERED_SHAPE, OPEN_SHAPE } from './excel/columns'
import { parseBacklogWorkbook, type RawBacklogRow } from './excel/parse'
import { deriveSnapshot } from '@/portal/derive'
import type { PortalSnapshot } from '@/portal/types'

export interface XlsxLoadResult {
  readonly snapshot: PortalSnapshot
  /** Columns present in the file that we do not map. Worth a look, never fatal. */
  readonly warnings: readonly string[]
}

/**
 * Both reports, concatenated.
 *
 * The source report drops an item the moment it is fully delivered, so reading only
 * the Open Backlog file makes a customer's finished panels vanish from their
 * account — and makes "total contract value" and "open backlog" the same number,
 * which is only true while nothing has shipped. Spec, Delta 4.
 *
 * The two cannot overlap: one holds `delivered_qty < qty`, the other
 * `delivered_qty >= qty`. `deliveredPath` is optional so a deployment with only the
 * backlog export still works, at the cost of hiding delivered history.
 */
export async function loadXlsxSnapshot(
  path: string,
  deliveredPath?: string,
): Promise<XlsxLoadResult> {
  const open = await parseBacklogWorkbook(path, OPEN_SHAPE)

  if (open.rows.length === 0) {
    throw new Error(
      `The backlog export at "${path}" has a valid header but no data rows. ` +
        `Refusing to serve an empty portal, which would read to every customer as ` +
        `"nothing has happened on your order".`,
    )
  }

  let rows: readonly RawBacklogRow[] = open.rows
  const warnings = [...open.headerWarnings]

  if (deliveredPath) {
    const delivered = await parseBacklogWorkbook(deliveredPath, DELIVERED_SHAPE)
    warnings.push(...delivered.headerWarnings)
    if (delivered.rows.length === 0) {
      warnings.push(
        `The delivered export at "${deliveredPath}" has a valid header but no rows. ` +
          `Continuing with open backlog only.`,
      )
    }
    rows = [...open.rows, ...delivered.rows]
  } else {
    warnings.push(
      'No delivered export supplied. Fully delivered items will be absent from every ' +
        'customer account, and contract value will equal open backlog.',
    )
  }

  // The as-of date is recovered from the rows themselves; the filename's date is
  // only a fallback, because a filename is not evidence.
  const fallback = /(\d{4}-\d{2}-\d{2})(?!.*\d{4}-\d{2}-\d{2})/.exec(path)?.[1] ?? '1970-01-01'

  return { snapshot: deriveSnapshot(rows, fallback), warnings }
}
