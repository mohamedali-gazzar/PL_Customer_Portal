/**
 * The derivation rules, tested directly.
 *
 * Every status a customer sees is computed in `derive.ts`, so these are the tests
 * that stop a refactor quietly changing what somebody is told about their order.
 *
 * They are built from hand-written rows rather than from a spreadsheet, and that is
 * deliberate. The export is replaced whenever a new one is produced; a test that
 * read it would have to be regenerated each time, and would then be unable to tell
 * "the data moved" from "a rule broke" — which is the only thing it exists to say.
 *
 * The cases are not invented. Each one is a shape that occurs in the real export
 * and was verified, row for row, against the approved prototype's own dataset when
 * these rules were written: joined work-order statuses, `Closed` as a completion,
 * a missing initial-drawing timestamp, superseded material dates, open and closed
 * rework, and partial delivery.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  deriveExportDate,
  deriveItem,
  deriveOrders,
  deriveSnapshot,
  phaseDurations,
  workOrderProgress,
} from '@/portal/derive'
import { STATE } from '@/portal/types'
import { COLUMN_KEYS, type ColumnKey } from '@/providers/excel/columns'
import type { RawBacklogRow } from '@/providers/excel/parse'

type Fields = Partial<Record<ColumnKey, string | number | null>>

/** A row with every column blank, so each test states only what it depends on. */
function row(fields: Fields, n = 2): RawBacklogRow {
  const r: Record<string, unknown> = { __rowNumber: n }
  for (const k of COLUMN_KEYS) r[k] = null
  Object.assign(r, fields)
  return r as unknown as RawBacklogRow
}

/** The common spine: an order for one panel, placed and priced. */
const ordered: Fields = {
  salesOrder: 'SO-25-00001',
  project: 'P',
  customer: 'Acme',
  item: 'PANEL-A',
  soQty: 1,
  deliveredQty: 0,
  remainingQty: 1,
  backlogAmount: 500,
  soSubmitted: '2026-01-01',
  contractualDate: '2026-06-01',
  ageSinceSo: 100,
  daysToContractual: 40,
}

/* ------------------------------------------------------------------ money -- */

test('the unit rate is recovered from the open value, never assumed', () => {
  const it = deriveItem(
    0,
    row({ ...ordered, soQty: 12, deliveredQty: 2, remainingQty: 10, backlogAmount: 2_827_054.4 }),
  )
  assert.equal(it.rate, 282_705.44)
  assert.equal(it.contract, 12 * 282_705.44)
  assert.equal(it.dvalue, 2 * 282_705.44)
  assert.equal(it.backlog, 2_827_054.4, 'the open value is carried through untouched')
})

test('a line with nothing remaining has no rate rather than a division by zero', () => {
  const it = deriveItem(0, row({ ...ordered, remainingQty: 0, backlogAmount: 0 }))
  assert.equal(it.rate, 0)
  assert.ok(Number.isFinite(it.contract))
})

/* ------------------------------------------------------------ work orders -- */

test('a joined work-order status resolves to the most advanced', () => {
  // 28 lines in the export carry several work orders, statuses joined as text.
  // Reporting the least advanced would hide progress the line demonstrably made.
  assert.equal(workOrderProgress('Completed, Not Started'), 'done')
  assert.equal(workOrderProgress('In Process, Not Started'), 'active')
  assert.equal(workOrderProgress('Not Started'), 'notstarted')
  assert.equal(workOrderProgress(null), null)
})

test('Closed counts as complete, though the rule table in the brief predates it', () => {
  assert.equal(workOrderProgress('Closed'), 'done')
  const it = deriveItem(
    0,
    row({
      ...ordered,
      mainWoCount: 1,
      workOrder: 'WO-1',
      mainWoStatus: 'Closed',
      mainMaterialStatus: 'Available',
      mainCreated: '2026-02-01',
      mainMaterialReady: '2026-02-10',
    }),
  )
  assert.equal(it.st[2]![0], STATE.done)
  assert.equal(it.st[2]![1], 'Completed')
})

/* ------------------------------------------------------------------ chain -- */

test('only an initial drawing opens the chain: a revision is not a first submission', () => {
  const it = deriveItem(
    0,
    row({
      ...ordered,
      initialApprovalRfds: 0,
      revisionRfds: 2,
      revCreated: '2026-02-20',
      revSubmitted: '2026-03-01',
      releasedRfds: 1,
      relCreated: '2026-03-01',
      relSubmitted: '2026-03-05',
    }),
  )
  assert.equal(it.ch[1], null, 'a revision submission must not stand in for the initial one')
  assert.equal(it.ch[2], '2026-03-01')
  assert.equal(it.T[0], null, 'so T1 is unmeasured, not zero')
})

test('the T durations are exactly the gaps between consecutive chain timestamps', () => {
  const chain = ['2026-01-01', '2026-01-11', '2026-02-01', '2026-02-06', null, null, null, null, null]
  assert.deepEqual(phaseDurations(chain).slice(0, 4), [10, 21, 5, null])
})

/* ------------------------------------------------------------- milestones -- */

test('released drawings are approved, even with no submission date recorded', () => {
  const it = deriveItem(
    0,
    row({
      ...ordered,
      initialApprovalRfds: 1,
      iaCreated: '2026-02-02',
      iaSubmitted: '2026-02-05',
      releasedRfds: 1,
      relCreated: '2026-03-10',
    }),
  )
  assert.equal(it.st[0]![0], STATE.done)
  assert.equal(it.st[0]![1], 'Approved')
  assert.equal(it.st[0]![2], '2026-02-02', 'the stage starts at the earliest drawing activity')
  assert.equal(it.st[0]![3], null, 'and claims no end date it does not have')
})

test('the earliest drawing activity starts the stage, so a revision cannot invert it', () => {
  // A drawing released in January and revised in July once made stage 1 report an
  // actual start after its actual end, drawn as a six-month bar.
  const it = deriveItem(
    0,
    row({
      ...ordered,
      initialApprovalRfds: 1,
      iaCreated: '2026-01-05',
      iaSubmitted: '2026-01-08',
      revisionRfds: 1,
      revCreated: '2026-07-01',
      releasedRfds: 1,
      relCreated: '2026-01-20',
      relSubmitted: '2026-07-15',
    }),
  )
  const start = it.st[0]![2]
  const end = it.st[0]![3]
  assert.ok(start !== null && end !== null && start < end, `${start} must precede ${end}`)
  assert.equal(start, '2026-01-05')
})

test('a re-planned material date supersedes the original', () => {
  const it = deriveItem(
    0,
    row({
      ...ordered,
      mainWoCount: 1,
      workOrder: 'WO-1',
      mainMaterialStatus: 'Partially Available',
      mainMaterialDeliveryDate: '2026-09-01',
      mainModifiedMaterialDeliveryDate: '2026-10-19',
    }),
  )
  assert.equal(it.st[1]![4], '2026-10-19')
  assert.equal(it.st[1]![0], STATE.active)
  assert.equal(it.st[1]![1], 'Partially available')
})

test('manufacturing starts when material lands, or falls back to the work order', () => {
  const withMaterial = deriveItem(
    0,
    row({
      ...ordered,
      mainWoCount: 1,
      workOrder: 'W',
      mainWoStatus: 'Completed',
      mainCreated: '2026-02-01',
      mainMaterialReady: '2026-03-01',
      mainClosed: '2026-03-05',
    }),
  )
  assert.equal(withMaterial.st[2]![2], '2026-03-01')

  const withoutMaterial = deriveItem(
    0,
    row({
      ...ordered,
      mainWoCount: 1,
      workOrder: 'W',
      mainWoStatus: 'Completed',
      mainCreated: '2026-02-01',
      mainClosed: '2026-03-05',
    }),
  )
  assert.equal(withoutMaterial.st[2]![2], '2026-02-01', 'the only honest fallback')
})

test('a line with no work order is not released, and is not material-unavailable', () => {
  const it = deriveItem(
    0,
    row({ ...ordered, releasedRfds: 1, relCreated: '2026-02-01', relSubmitted: '2026-02-05' }),
  )
  assert.equal(it.st[1]![1], 'Not started')
  assert.equal(it.st[2]![1], 'Not released')
  assert.equal(it.st[3]![1], 'Not ready')
})

test('rework is reported neutrally, and never names a reason', () => {
  const base: Fields = {
    ...ordered,
    mainWoCount: 1,
    workOrder: 'W',
    mainWoStatus: 'Completed',
    mainCreated: '2026-02-01',
    mainMaterialReady: '2026-02-20',
    mainClosed: '2026-03-01',
  }

  const open = deriveItem(
    0,
    row({
      ...base,
      reworkWoCount: 1,
      reworkWoStatus: 'In Process',
      reworkCreated: '2026-04-01',
      reworkPlannedEndDate: '2026-05-01',
    }),
  )
  assert.equal(open.st[3]![0], STATE.active)
  assert.equal(open.st[3]![1], 'Final quality adjustments in progress')
  assert.equal(open.st[3]![4], '2026-05-01')
  assert.equal(open.st[5]![1], 'Not ready', 'an open adjustment is not ready to deliver')

  const closed = deriveItem(
    0,
    row({ ...base, reworkWoCount: 1, reworkCreated: '2026-04-01', reworkClosed: '2026-05-10' }),
  )
  assert.equal(closed.st[3]![0], STATE.done)
  assert.equal(closed.st[3]![1], 'Final quality adjustments complete')
  assert.equal(closed.st[5]![1], 'Ready for delivery')

  const none = deriveItem(0, row(base))
  assert.equal(none.st[3]![1], 'Ready for FAT')
})

test('a partial delivery says how much, in the quantities the order used', () => {
  const it = deriveItem(
    0,
    row({ ...ordered, soQty: 2, deliveredQty: 1, remainingQty: 1, backlogAmount: 500 }),
  )
  assert.equal(it.st[5]![1], 'Partially delivered (1 of 2)')
})

test('stages with no source document report as unavailable, never as incomplete', () => {
  const it = deriveItem(0, row(ordered))
  assert.equal(it.st[4]![0], STATE.gap)
  assert.equal(it.st[4]![1], 'Awaiting Payment Entry feed')
  assert.equal(it.st[6]![0], STATE.gap)
  assert.equal(it.st[6]![1], 'Awaiting Sales Invoice feed')
})

/* --------------------------------------------------------------- progress -- */

test('progress averages only the stages that can be computed', () => {
  // Counting the two unavailable stages as incomplete would cap every panel at 71%.
  const untouched = deriveItem(0, row(ordered))
  assert.equal(untouched.pct, 0)

  const approved = deriveItem(
    0,
    row({ ...ordered, releasedRfds: 1, relCreated: '2026-02-01', relSubmitted: '2026-02-05' }),
  )
  assert.equal(approved.pct, 20, 'one of five measurable stages done')

  const built = deriveItem(
    0,
    row({
      ...ordered,
      releasedRfds: 1,
      relCreated: '2026-02-01',
      relSubmitted: '2026-02-05',
      mainWoCount: 1,
      workOrder: 'W',
      mainWoStatus: 'Completed',
      mainMaterialStatus: 'Available',
      mainCreated: '2026-02-06',
      mainMaterialReady: '2026-03-01',
      mainClosed: '2026-03-10',
    }),
  )
  assert.equal(built.pct, 80, 'three done, FAT and delivery ready')
})

test('lateness comes from the report own countdown', () => {
  assert.equal(deriveItem(0, row({ ...ordered, daysToContractual: -5 })).late, 1)
  assert.equal(deriveItem(0, row({ ...ordered, daysToContractual: 5 })).late, 0)
  assert.equal(deriveItem(0, row({ ...ordered, daysToContractual: null })).late, 0, 'no date is not late')
})

/* ------------------------------------------------------------------ as-of -- */

test('the as-of date is recovered from the rows, not from the filename', () => {
  const rows = [
    row({ soSubmitted: '2026-01-01', ageSinceSo: 229 }),
    row({ soSubmitted: '2026-02-01', ageSinceSo: 198 }),
    row({ soSubmitted: '2026-03-01', ageSinceSo: 999 }), // one disagreeing row
  ]
  assert.equal(deriveExportDate(rows, '1970-01-01'), '2026-08-18', 'the majority wins')
})

/* --------------------------------------------------------------- rollups -- */

test('an order takes the earliest contractual date and the tightest countdown', () => {
  const orders = deriveOrders([
    deriveItem(0, row({ ...ordered, contractualDate: '2026-06-17', daysToContractual: -420 })),
    deriveItem(1, row({ ...ordered, contractualDate: '2026-06-09', daysToContractual: -428 })),
  ])
  const order = orders[0]!
  assert.equal(order.cDate, '2026-06-09')
  assert.equal(order.dtc, -428)
  assert.equal(order.nItems, 2)
  assert.equal(order.late, 1, 'one late line makes the order late')
})

test('what an order waits for is set by its least advanced line', () => {
  const orders = deriveOrders([
    deriveItem(
      0,
      row({
        ...ordered,
        releasedRfds: 1,
        relCreated: '2026-02-01',
        relSubmitted: '2026-02-05',
        mainWoCount: 1,
        workOrder: 'W',
        mainWoStatus: 'Completed',
        mainMaterialStatus: 'Available',
        mainCreated: '2026-02-06',
        mainMaterialReady: '2026-03-01',
        mainClosed: '2026-03-10',
      }),
    ),
    deriveItem(
      1,
      row({ ...ordered, initialApprovalRfds: 1, iaCreated: '2026-02-01', iaSubmitted: '2026-02-03' }),
    ),
  ])
  const order = orders[0]!
  assert.equal(order.next, 'Sent for approval', 'the slowest panel, not the furthest along')
  assert.equal(order.await, 1, 'a drawing sitting with the customer raises the flag')
})

test('orders and customers are ranked by open commitment, largest first', () => {
  const snap = deriveSnapshot(
    [
      row({ ...ordered, salesOrder: 'SO-small', customer: 'Small Co', backlogAmount: 100 }),
      row({ ...ordered, salesOrder: 'SO-big', customer: 'Big Co', backlogAmount: 900 }),
    ],
    '2026-08-18',
  )

  assert.deepEqual(snap.orders.map((o) => o.so), ['SO-big', 'SO-small'])
  assert.deepEqual(snap.customers.map((c) => c.name), ['Big Co', 'Small Co'])
  assert.equal(snap.meta.backlog, 1000)
  assert.equal(snap.meta.customers, 2)
})

test('the p90 is a value that actually occurred, not an interpolation', () => {
  // It is quoted as "nine in ten finish within N days", which is only true of a
  // real observation.
  const rows = Array.from({ length: 10 }, (_, i) => row({ ...ordered, t5Manufacturing: (i + 1) * 10 }))
  const bench = deriveSnapshot(rows, '2026-08-18').meta.bench.find((b) => b.n === 'T5 Manufacturing')!
  assert.equal(bench.count, 10)
  assert.equal(bench.p90, 90)
  assert.equal(bench.med, 55)
  assert.equal(bench.max, 100)
})
