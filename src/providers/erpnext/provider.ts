/**
 * The ERPNext provider: live documents, as a portal snapshot.
 *
 * The queries are brief §9, and the field names were verified against the live
 * Powerline instance when the brief was written. The join it performs is the same
 * one the PM Phase Cycle Times report performs in SQL — which is why it can hand
 * its rows to exactly the same derivation the Excel provider uses, and get
 * statuses that are identical by construction rather than by inspection.
 *
 * ┌ Sales Order ─── items[] ─┬─ Work Order      (sales_order, sales_order_item)
 * │                          └─ Request For Design (sales_order)
 *
 * Not yet exercised against a live instance: Powerline's ERP was not reachable
 * from this machine. Everything below is written to the documented API and typed
 * end to end, but the first run against real data should be done on staging with
 * `PORTAL_DATA_PROVIDER=erpnext`, comparing a handful of orders against the same
 * orders in the Excel provider. `docs/ERPNEXT.md` lists that checklist.
 */

import { deriveSnapshot, isoDate, phaseDurations } from '@/portal/derive'
import type { PortalSnapshot } from '@/portal/types'
import type { RawBacklogRow } from '@/providers/excel/parse'
import type { ColumnKey } from '@/providers/excel/columns'
import type { PortalConfig } from '@/server/config'
import { ErpNextClient, mapWithConcurrency } from './client'

/* ----------------------------------------------------------- doc shapes -- */

interface SalesOrderDoc extends Record<string, unknown> {
  name: string
  customer: string
  project?: string | null
  transaction_date?: string | null
  delivery_date?: string | null
  po_no?: string | null
  items?: SalesOrderItemDoc[]
}

interface SalesOrderItemDoc extends Record<string, unknown> {
  name: string
  item_code: string
  item_name?: string | null
  item_group?: string | null
  qty?: number | null
  delivered_qty?: number | null
  rate?: number | null
  amount?: number | null
  delivery_date?: string | null
}

interface WorkOrderDoc extends Record<string, unknown> {
  name: string
  sales_order?: string | null
  sales_order_item?: string | null
  production_item?: string | null
  qty?: number | null
  produced_qty?: number | null
  status?: string | null
  material_status?: string | null
  creation?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  material_delivery_date?: string | null
  custom_last_material_transfer_for_manufacture?: string | null
  custom_manufacture_submission_date?: string | null
  rework_required?: number | null
  custom_reworked_work_order?: string | null
  project?: string | null
}

interface RfdDoc extends Record<string, unknown> {
  name: string
  sales_order?: string | null
  type?: string | null
  workflow_state?: string | null
  creation?: string | null
  custom_submission_date?: string | null
  custom_approval_date?: string | null
  request_due_date?: string | null
}

/* -------------------------------------------------------------- helpers -- */

const day = (v: unknown): string | null =>
  typeof v === 'string' || v instanceof Date ? isoDate(v as string | Date) : null

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const earliest = (xs: (string | null)[]): string | null =>
  xs.filter(Boolean).sort()[0] ?? null

const latest = (xs: (string | null)[]): string | null =>
  xs.filter(Boolean).sort().at(-1) ?? null

/** An RFD's kind, from the free-text `type` used in the live instance. */
function rfdKind(t: string | null | undefined): 'initial' | 'revision' | 'release' | null {
  const s = (t ?? '').toLowerCase()
  if (s.includes('initial')) return 'initial'
  if (s.includes('revision')) return 'revision'
  if (s.includes('release')) return 'release'
  return null
}

/** Build the row the shared derivation expects. Blank means "no such document". */
function blankRow(rowNumber: number): Record<ColumnKey | '__rowNumber', unknown> {
  return { __rowNumber: rowNumber } as Record<ColumnKey | '__rowNumber', unknown>
}

/* ------------------------------------------------------------- provider -- */

export async function loadErpNextSnapshot(cfg: PortalConfig): Promise<PortalSnapshot> {
  if (!cfg.erpnext) {
    throw new Error('The ERPNext provider was selected but ERPNEXT_* configuration is absent.')
  }
  const client = new ErpNextClient(cfg.erpnext)

  // 1. Open, submitted sales orders. This is the portal's universe.
  const orderList = await client.list<{ name: string }>('Sales Order', {
    fields: ['name'],
    filters: [
      ['docstatus', '=', 1],
      ['status', 'not in', ['Closed', 'Completed']],
    ],
    orderBy: 'transaction_date asc',
  })

  // 2. Full documents, for their item child tables. A restricted role cannot list
  //    `Sales Order Item` directly (brief §9), so the parent is fetched instead.
  const orders = await mapWithConcurrency(orderList, 6, (o) =>
    client.get<SalesOrderDoc>('Sales Order', o.name),
  )
  const orderNames = orders.map((o) => o.name)

  // 3. Work orders and drawing requests for those orders, in bulk.
  const [workOrders, rfds] = await Promise.all([
    client.list<WorkOrderDoc>('Work Order', {
      fields: [
        'name', 'sales_order', 'sales_order_item', 'production_item', 'qty', 'produced_qty',
        'status', 'material_status', 'creation', 'planned_start_date', 'planned_end_date',
        'material_delivery_date', 'custom_last_material_transfer_for_manufacture',
        'custom_manufacture_submission_date', 'rework_required', 'custom_reworked_work_order',
        'project',
      ],
      filters: [['sales_order', 'in', orderNames]],
    }),
    client.list<RfdDoc>('Request For Design', {
      fields: [
        'name', 'sales_order', 'type', 'workflow_state', 'creation',
        'custom_submission_date', 'custom_approval_date', 'request_due_date',
      ],
      filters: [['sales_order', 'in', orderNames]],
    }),
  ])

  // Index by the keys the join needs.
  const woByLine = new Map<string, WorkOrderDoc[]>()
  for (const wo of workOrders) {
    const key = `${wo.sales_order ?? ''}::${wo.sales_order_item ?? wo.production_item ?? ''}`
    const list = woByLine.get(key)
    if (list) list.push(wo)
    else woByLine.set(key, [wo])
  }
  const rfdByOrder = new Map<string, RfdDoc[]>()
  for (const r of rfds) {
    const list = rfdByOrder.get(r.sales_order ?? '')
    if (list) list.push(r)
    else rfdByOrder.set(r.sales_order ?? '', [r])
  }

  const asOf = isoDate(new Date())!
  const rows: RawBacklogRow[] = []

  for (const order of orders) {
    const orderRfds = rfdByOrder.get(order.name) ?? []
    const ia = orderRfds.filter((r) => rfdKind(r.type) === 'initial')
    const rev = orderRfds.filter((r) => rfdKind(r.type) === 'revision')
    const rel = orderRfds.filter((r) => rfdKind(r.type) === 'release')

    for (const line of order.items ?? []) {
      const qty = n(line.qty) ?? 0
      const delivered = n(line.delivered_qty) ?? 0
      const remaining = Math.max(0, qty - delivered)
      const rate = n(line.rate) ?? 0

      const all = woByLine.get(`${order.name}::${line.name}`) ?? woByLine.get(`${order.name}::${line.item_code}`) ?? []
      const main = all.filter((w) => !w.rework_required)
      const rework = all.filter((w) => Boolean(w.rework_required))

      const soDate = day(order.transaction_date)
      const contractual = day(line.delivery_date) ?? day(order.delivery_date)

      const row = blankRow(rows.length + 2)

      row.salesOrder = order.name
      row.project = order.project ?? order.name
      row.customer = order.customer
      row.projectManager = null // resolved from the Project's owner in a later pass
      row.itemGroup = line.item_group ?? null
      row.item = line.item_code
      row.itemName = line.item_name ?? null
      row.onHold = 0
      row.soQty = qty
      row.deliveredQty = delivered
      row.remainingQty = remaining
      // The derivation recovers a unit rate as backlog ÷ remaining, so the open
      // value is supplied in exactly that form.
      row.backlogAmount = remaining * rate
      row.soSubmitted = soDate
      row.contractualDate = contractual
      row.contractualPeriodDays = null

      row.initialApprovalRfds = ia.length
      row.iaCreated = earliest(ia.map((r) => day(r.creation)))
      row.iaSubmitted = earliest(ia.map((r) => day(r.custom_submission_date)))
      row.revisionRfds = rev.length
      row.revCreated = earliest(rev.map((r) => day(r.creation)))
      row.revSubmitted = earliest(rev.map((r) => day(r.custom_submission_date)))
      row.releasedRfds = rel.length
      row.relCreated = earliest(rel.map((r) => day(r.creation)))
      row.relSubmitted = earliest(rel.map((r) => day(r.custom_submission_date) ?? day(r.custom_approval_date)))

      row.woCount = all.length
      row.workOrder = all.map((w) => w.name).join(', ') || null
      row.woQty = all.reduce((a, w) => a + (n(w.qty) ?? 0), 0) || null
      row.producedQty = all.reduce((a, w) => a + (n(w.produced_qty) ?? 0), 0) || null

      row.mainWoCount = main.length
      // Joined exactly as the report joins them; the derivation resolves the mix.
      row.mainWoStatus = main.map((w) => w.status ?? '').filter(Boolean).join(', ') || null
      row.mainCreated = earliest(main.map((w) => day(w.creation)))
      row.mainMaterialStatus = main[0]?.material_status ?? null
      row.mainMaterialDeliveryDate = earliest(main.map((w) => day(w.material_delivery_date)))
      row.mainPlannedEndDate = latest(main.map((w) => day(w.planned_end_date)))
      row.mainModifiedMaterialDeliveryDate = null
      row.mainMaterialReady = latest(main.map((w) => day(w.custom_last_material_transfer_for_manufacture)))
      row.mainClosed = latest(main.map((w) => day(w.custom_manufacture_submission_date)))

      row.reworkWoCount = rework.length
      row.reworkWoStatus = rework.map((w) => w.status ?? '').filter(Boolean).join(', ') || null
      row.reworkCreated = earliest(rework.map((w) => day(w.creation)))
      row.reworkMaterialStatus = rework[0]?.material_status ?? null
      row.reworkMaterialDeliveryDate = earliest(rework.map((w) => day(w.material_delivery_date)))
      row.reworkPlannedEndDate = latest(rework.map((w) => day(w.planned_end_date)))
      row.reworkMaterialReady = latest(rework.map((w) => day(w.custom_last_material_transfer_for_manufacture)))
      row.reworkClosed = latest(rework.map((w) => day(w.custom_manufacture_submission_date)))

      // T1–T8 are the gaps in the timestamp chain. The Excel report ships them as
      // columns; here they are computed from the same nine timestamps, which was
      // verified to be an identity on every row of the export.
      const chain = [
        row.soSubmitted as string | null,
        row.iaSubmitted as string | null,
        row.relCreated as string | null,
        row.relSubmitted as string | null,
        row.mainMaterialReady as string | null,
        row.mainClosed as string | null,
        row.reworkCreated as string | null,
        row.reworkMaterialReady as string | null,
        row.reworkClosed as string | null,
      ]
      const T = phaseDurations(chain)
      const tKeys: ColumnKey[] = [
        't1DrawingsSubmission', 't2CustomerApproval', 't3WoRelease', 't4Material',
        't5Manufacturing', 't6ReworkRelease', 't7ReworkMaterial', 't8ReworkManufacturing',
      ]
      tKeys.forEach((k, i) => {
        row[k] = T[i] ?? null
      })

      row.ageSinceSo = soDate ? Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${soDate}T00:00:00Z`)) / 86_400_000) : null
      row.daysToContractual = contractual
        ? Math.round((Date.parse(`${contractual}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000)
        : null
      row.mainDays = null
      row.reworkDays = null

      rows.push(row as unknown as RawBacklogRow)
    }
  }

  return deriveSnapshot(rows, asOf)
}
