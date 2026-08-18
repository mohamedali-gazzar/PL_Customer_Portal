/**
 * The project filters.
 *
 * A filter that quietly drops or double-counts a record is worse than no filter,
 * because the total on screen still looks authoritative. And a status filter that
 * disagrees with the badge on the card is worse still: you select "Past contractual
 * date" and get cards labelled something else.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { byYear, indexItems, orderYears } from '@/ui/lib/select'
import { PROJECT_STATUSES, projectStatus } from '@/ui/lib/status'
import { WO_STATUSES, byWoStatus, woStatusCounts, woStatusOf } from '@/ui/lib/wo-status'
import type { PortalItem, PortalOrder, Stage } from '@/portal/types'
import { STATE } from '@/portal/types'

interface Flags {
  hold?: number
  late?: number
  await?: number
}

const order = (so: string, soDate: string | null, flags: Flags = {}): PortalOrder => ({
  so,
  cust: 'C',
  proj: 'P',
  pm: 'PM',
  soDate,
  cDate: null,
  cPeriod: null,
  items: [],
  contract: 1000,
  backlog: 1000,
  dvalue: 0,
  qty: 1,
  deliv: 0,
  hold: flags.hold ?? 0,
  pct: 0,
  nItems: 1,
  late: flags.late ?? 0,
  dtc: null,
  age: null,
  next: null,
  await: flags.await ?? 0,
})

/**
 * The overlaps are the point. In the real portfolio 7 orders are both late and
 * awaiting approval, and 7 more are both on hold and late.
 */
const orders = [
  order('CLEAN', '2026-03-01'),
  order('LATE', '2026-02-01', { late: 1 }),
  order('WAITING', '2025-07-01', { await: 1 }),
  order('LATE_AND_WAITING', '2025-01-01', { late: 1, await: 1 }),
  order('HELD', '2024-05-01', { hold: 1 }),
  order('HELD_AND_LATE', '2024-02-01', { hold: 1, late: 1 }),
  order('UNDATED', null, { late: 1 }),
]

/* ------------------------------------------------------------------- years -- */

test('years are listed most recent first, and blanks are not years', () => {
  assert.deepEqual(orderYears(orders), ['2026', '2025', '2024'])
})

test('a year selects only that year, and excludes undated orders', () => {
  assert.deepEqual(byYear(orders, '2025').map((o) => o.so), ['WAITING', 'LATE_AND_WAITING'])
  assert.deepEqual(byYear(orders, '2023').map((o) => o.so), [])
  assert.equal(byYear(orders, 'all').length, 7, 'all keeps the undated order too')
})

/* ------------------------------------------------------- the badge on a card -- */

test('a project badge shows exactly one status, resolved by priority', () => {
  // The conditions overlap: an order can be late and awaiting approval at once.
  assert.equal(projectStatus(orders[0]!).key, 'ontrack')
  assert.equal(projectStatus(orders[1]!).key, 'late')
  assert.equal(projectStatus(orders[2]!).key, 'action')
  assert.equal(projectStatus(orders[3]!).key, 'late', 'late outranks awaiting approval')
  assert.equal(projectStatus(orders[4]!).key, 'hold')
  assert.equal(projectStatus(orders[5]!).key, 'hold', 'a hold outranks how late it is')
})

test('every project resolves to one of the declared statuses', () => {
  const keys = new Set(PROJECT_STATUSES.map((s) => s.key))
  for (const o of orders) assert.ok(keys.has(projectStatus(o).key))
})

/* -------------------------------------------------- work order status filter -- */

const stage = (): Stage => [STATE.none, 'x', null, null, null]

function item(id: number, wo: string | null, woStatus: string | null): PortalItem {
  return {
    id, so: 'SO', proj: 'P', cust: 'C', pm: null, grp: null, code: `C${id}`, name: null,
    hold: 0, qty: 1, deliv: 0, remain: 1, rate: 0, contract: 0, backlog: 0, dvalue: 0,
    soDate: '2026-01-01', cDate: null, cPeriod: null,
    ...(wo ? { wo, woQty: 1, prodQty: 0, woStatus, matStatus: null } : {}),
    rework: 0, ch: ['2026-01-01'], nIA: 0, nRev: 0, nRel: 0,
    T: [null, null, null, null, null, null, null, null],
    age: null, dtc: null, late: 0, pct: 0,
    st: [stage(), stage(), stage(), stage(), stage(), stage(), stage()],
    nextStage: 'x', nextStatus: 'x',
  }
}

const lines = [
  item(0, 'WO-1', 'Completed'),
  item(1, 'WO-2', 'In Process'),
  item(2, 'WO-3', 'Not Started'),
  item(3, null, null),
  item(4, 'WO-5', 'Closed'),
  item(5, 'WO-6', 'Completed, Not Started'),
  item(6, 'WO-7', 'In Process, Not Started'),
]
const byId = indexItems(lines)

const withLines = (so: string, ids: number[]): PortalOrder => ({
  ...order(so, '2026-01-01'),
  items: ids,
})

test('the seven raw ERP values collapse to four buckets', () => {
  // Offering "Completed, Not Started" verbatim would put an option in the list
  // matching one row, and mean nothing to a customer.
  assert.equal(woStatusOf(lines[0]!), 'completed')
  assert.equal(woStatusOf(lines[1]!), 'inprocess')
  assert.equal(woStatusOf(lines[2]!), 'notstarted')
  assert.equal(woStatusOf(lines[3]!), 'nowo', 'no work order is a state, not a gap')
  assert.equal(woStatusOf(lines[4]!), 'completed', 'Closed counts as a completion')
  assert.equal(woStatusOf(lines[5]!), 'completed', 'the most advanced status in the string wins')
  assert.equal(woStatusOf(lines[6]!), 'inprocess')
})

test('every line resolves to one of the declared buckets', () => {
  const keys = new Set(WO_STATUSES.map((s) => s.key))
  for (const l of lines) assert.ok(keys.has(woStatusOf(l)), `${l.code} fell outside the buckets`)
})

test('a project matches if any of its panels is at that status', () => {
  // 38 of the 157 real orders span more than one work-order status. Requiring all
  // of them to match would silently hide an order that is partly in the state
  // being asked about.
  const mixed = withLines('MIXED', [0, 2])
  const built = withLines('BUILT', [0, 4])
  const list = [mixed, built]

  assert.deepEqual(byWoStatus(list, byId, 'completed').map((o) => o.so), ['MIXED', 'BUILT'])
  assert.deepEqual(byWoStatus(list, byId, 'notstarted').map((o) => o.so), ['MIXED'])
  assert.deepEqual(byWoStatus(list, byId, 'inprocess').map((o) => o.so), [])
  assert.deepEqual(byWoStatus(list, byId, 'all').map((o) => o.so), ['MIXED', 'BUILT'])
})

test('an order is counted once per status, however many panels are in it', () => {
  const many = withLines('MANY', [0, 4, 5, 2])
  const counts = woStatusCounts([many], byId)
  assert.equal(counts.completed, 1, 'three completed panels are still one project')
  assert.equal(counts.notstarted, 1)
  assert.equal(counts.inprocess, 0)
})

test('a project whose lines are missing from the index is not matched', () => {
  const dangling = withLines('DANGLING', [999])
  assert.deepEqual(byWoStatus([dangling], byId, 'completed'), [])
})

/* ------------------------------------------------------------- composition -- */

test('the two filters compose, narrowing rather than replacing', () => {
  const a = { ...withLines('A', [0]), soDate: '2026-01-01' }
  const b = { ...withLines('B', [2]), soDate: '2025-01-01' }
  const list = [a, b]

  assert.deepEqual(byWoStatus(byYear(list, '2026'), byId, 'completed').map((o) => o.so), ['A'])
  assert.deepEqual(byWoStatus(byYear(list, '2026'), byId, 'notstarted'), [], 'an empty intersection is empty')
})

test('filtering never mutates the source list', () => {
  const before = orders.map((o) => o.so)
  byYear(orders, '2025')
  byWoStatus(orders, byId, 'completed')
  assert.deepEqual(orders.map((o) => o.so), before)
})
