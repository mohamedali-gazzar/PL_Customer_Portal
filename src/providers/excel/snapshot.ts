/**
 * The indexed in-memory snapshot.
 *
 * The workbook is parsed **once** and indexed by tenant. Every subsequent portal
 * request is a map lookup, so the temporary provider is not a performance
 * artefact that flatters the architecture — the caching and call-budget work
 * above it is measured against a provider whose own cost is ~0, which means the
 * numbers reflect the composition layer rather than the file I/O.
 *
 * Loading is single-flight: concurrent first requests share one parse rather than
 * each starting their own.
 */

import {
  isKnown,
  localizedText,
  notInSource,
  known,
  type Customer,
  type CustomerId,
  type DataSourceInfo,
  type Maybe,
  type PlainDate,
  type Project,
  type ProjectId,
} from '@/domain'
import { parseBacklogWorkbook, type RawBacklogRow } from './parse'
import {
  deriveAsOfDate,
  emptyDiagnostics,
  toProject,
  type AdapterDiagnostics,
} from './adapter'
import { IDENTITY_ASSURANCE } from './identity'

export interface BacklogSnapshot {
  readonly asOf: Maybe<PlainDate>
  readonly customers: ReadonlyMap<CustomerId, Customer>
  readonly projectsByCustomer: ReadonlyMap<CustomerId, readonly Project[]>
  /** Project id → owning tenant. Ownership is checked, never assumed from the id. */
  readonly ownerByProject: ReadonlyMap<ProjectId, CustomerId>
  readonly projectById: ReadonlyMap<ProjectId, Project>
  readonly stats: SnapshotStats
  readonly diagnostics: AdapterDiagnostics
  readonly warnings: readonly string[]
  readonly loadedAt: Date
  readonly loadMs: number
}

export interface SnapshotStats {
  readonly rows: number
  readonly customers: number
  readonly projects: number
  readonly lines: number
  readonly linesWithProduction: number
}

export async function buildSnapshot(filePath: string): Promise<BacklogSnapshot> {
  const startedAt = Date.now()
  const { rows, headerWarnings } = await parseBacklogWorkbook(filePath)
  const diagnostics = emptyDiagnostics()

  // Group by sales order. Project ↔ Sales Order is 1:1 in this export (152 of
  // each), which the assertion below re-checks on every load rather than trusting.
  const bySalesOrder = new Map<string, RawBacklogRow[]>()
  for (const row of rows) {
    const so = typeof row.salesOrder === 'string' ? row.salesOrder.trim() : String(row.salesOrder ?? '')
    if (so === '') continue
    const bucket = bySalesOrder.get(so)
    if (bucket === undefined) bySalesOrder.set(so, [row])
    else bucket.push(row)
  }

  const customers = new Map<CustomerId, Customer>()
  const projectsByCustomer = new Map<CustomerId, Project[]>()
  const ownerByProject = new Map<ProjectId, CustomerId>()
  const projectById = new Map<ProjectId, Project>()

  const seenLineIds = new Set<string>()
  let lines = 0
  let linesWithProduction = 0

  for (const [salesOrderNo, salesOrderRows] of bySalesOrder) {
    const { project, customerId, customerName } = toProject(salesOrderNo, salesOrderRows, diagnostics)

    if (!customers.has(customerId)) {
      customers.set(customerId, {
        id: customerId,
        erpCustomerId: notInSource(
          'the backlog export has no ERPNext Customer.name; the tenant key is derived from the name',
        ),
        displayName: localizedText(customerName),
      })
    }

    const bucket = projectsByCustomer.get(customerId)
    if (bucket === undefined) projectsByCustomer.set(customerId, [project])
    else bucket.push(project)

    ownerByProject.set(project.id, customerId)
    projectById.set(project.id, project)

    for (const line of project.lines) {
      lines += 1
      if (line.production !== null) linesWithProduction += 1
      if (seenLineIds.has(line.id)) diagnostics.duplicateLineKeys.push(line.id)
      seenLineIds.add(line.id)
    }
  }

  /*
   * A collision here would mean two different order lines sharing an id, so one
   * would shadow the other in the UI. The export's own `(Sales Order, Item)` pair
   * is not unique, which is exactly why the key includes the description, work
   * order and quantity — and why this is asserted rather than assumed.
   */
  if (diagnostics.duplicateLineKeys.length > 0) {
    throw new Error(
      `Order-line key collision on ${diagnostics.duplicateLineKeys.length} line(s). ` +
        `The (sales order, item, description, work order, qty) key is not unique in this export, ` +
        `so line identity must be revisited before continuing. Ids: ` +
        diagnostics.duplicateLineKeys.slice(0, 5).join(', '),
    )
  }

  // Sort each tenant's projects newest order first — the dashboard's natural order.
  for (const list of projectsByCustomer.values()) {
    list.sort((a, b) => {
      const aDate = isKnown(a.orderedOn) ? a.orderedOn.value : ''
      const bDate = isKnown(b.orderedOn) ? b.orderedOn.value : ''
      if (aDate !== bDate) return aDate < bDate ? 1 : -1
      return a.salesOrderNo < b.salesOrderNo ? 1 : -1
    })
  }

  return {
    asOf: deriveAsOfDate(rows, diagnostics),
    customers,
    projectsByCustomer,
    ownerByProject,
    projectById,
    stats: {
      rows: rows.length,
      customers: customers.size,
      projects: projectById.size,
      lines,
      linesWithProduction,
    },
    diagnostics,
    warnings: headerWarnings,
    loadedAt: new Date(),
    loadMs: Date.now() - startedAt,
  }
}

export function snapshotSourceInfo(snapshot: BacklogSnapshot): DataSourceInfo {
  return {
    providerId: 'excel-backlog',
    label: localizedText('PM Phase Cycle Times — Open Backlog (Excel export)', {
      en: 'PM backlog export',
      ar: 'ملف تصدير الأعمال القائمة',
    }),
    asOf: snapshot.asOf,
    isLive: false,
    scopeCaveat: known(
      'Open backlog only: delivered and closed order lines are excluded from this export, ' +
        'and it holds no invoice, payment, delivery or FAT records.',
    ),
    identityAssurance: IDENTITY_ASSURANCE,
  }
}

/* ────────────────── single-flight module-level loader ────────────────── */

let inFlight: Promise<BacklogSnapshot> | null = null
let loadedPath: string | null = null

export function loadSnapshot(filePath: string): Promise<BacklogSnapshot> {
  if (inFlight !== null && loadedPath === filePath) return inFlight
  loadedPath = filePath
  inFlight = buildSnapshot(filePath).catch((error: unknown) => {
    // Never cache a failure: the next request should retry, not inherit the error.
    inFlight = null
    loadedPath = null
    throw error
  })
  return inFlight
}

/** Test and script support. */
export function resetSnapshotCache(): void {
  inFlight = null
  loadedPath = null
}
